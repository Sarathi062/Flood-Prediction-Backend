const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');

class DamReleaseLSTMPredictor {
  constructor() {
    this.model = null;
    this.trained = false;
    this.scaler = null;
    this.modelMetadata = null;
    this.sequenceLength = 24; 

    this.features = [
      'rainfall_1h', 'rainfall_6h', 'rainfall_24h',
      'temperature_celsius', 'humidity', 'pressure', 'wind_speed',
      'current_water_level_percent', 'hour_of_day', 'is_monsoon_season',
      'wind_deg', 'wind_gust', 'clouds', 'visibility', 'dew_point', 'uvi'
    ];
  }

  prepareTrainingData(historicalData) {
    const sequences = [];
    const releaseTargets = [];
    const dischargeTargets = [];

    for (let i = this.sequenceLength; i < historicalData.length; i++) {
      const sequence = [];
      for (let j = i - this.sequenceLength; j < i; j++) {
        const sample = historicalData[j];
        const features = this.features.map(f => {
          let v = sample[f];
          if (v === undefined || v === null || isNaN(v)) {
            // sensible defaults for missing features
            switch(f) {
              case 'temperature_celsius': return 25;
              case 'humidity': return 70;
              case 'pressure': return 1013;
              case 'wind_speed': return 5;
              case 'current_water_level_percent': return 50;
              case 'hour_of_day': return 12;
              case 'is_monsoon_season': return 0;
              case 'wind_deg': return 0;
              case 'wind_gust': return 0;
              case 'clouds': return 0;
              case 'visibility': return 10000;
              case 'dew_point': return 15;
              case 'uvi': return 0;
              default: return 0;
            }
          }
          return Number(v);
        });
        sequence.push(features);
      }

      const currentSample = historicalData[i];

      // Target 1: Binary release occurrence
      const release = Number(currentSample.release_occurred) || 0;

      // Target 2: Discharge volume; zero if no release
      const discharge = release === 1 ? Number(currentSample.discharge_volume) || 0 : 0;

      sequences.push(sequence);
      releaseTargets.push([release]);     // shape: [numSamples, 1]
      dischargeTargets.push([discharge]); // shape: [numSamples, 1]
    }
    return { sequences, releaseTargets, dischargeTargets };
  }

  normalizeFeatures(data) {
    const featureCount = this.features.length;
    let featureMins = new Array(featureCount).fill(Infinity);
    let featureMaxs = new Array(featureCount).fill(-Infinity);

    for (const sequence of data) {
      for (const timestep of sequence) {
        for (let i = 0; i < featureCount; i++) {
          if (timestep[i] < featureMins[i]) featureMins[i] = timestep[i];
          if (timestep[i] > featureMaxs[i]) featureMaxs[i] = timestep[i];
        }
      }
    }

    const normalized = data.map(sequence =>
      sequence.map(timestep =>
        timestep.map((value, idx) => {
          const denom = featureMaxs[idx] - featureMins[idx];
          if (denom === 0) return 0;
          return (value - featureMins[idx]) / denom;
        })
      )
    );

    return { normalized, featureMins, featureMaxs };
  }

  normalizeTargets(targets) {
    const outputDim = targets[0].length;
    let mins = new Array(outputDim).fill(Infinity);
    let maxs = new Array(outputDim).fill(-Infinity);

    for (const target of targets) {
      for (let i = 0; i < outputDim; i++) {
        if (target[i] < mins[i]) mins[i] = target[i];
        if (target[i] > maxs[i]) maxs[i] = target[i];
      }
    }

    const normalized = targets.map(target =>
      target.map((val, idx) => {
        const denom = maxs[idx] - mins[idx];
        if (denom === 0) return 0;
        return (val - mins[idx]) / denom;
      })
    );

    return { normalized, mins, maxs };
  }

  async trainModel(historicalData) {
    console.log("🚀 Training dam release prediction model...");

    const { sequences, releaseTargets, dischargeTargets } = this.prepareTrainingData(historicalData);

    if (sequences.length < 10) {
      throw new Error(`Need at least 10 training samples, got ${sequences.length}`);
    }

    console.log(`Training with ${sequences.length} sequences`);
    console.log(`Feature count: ${this.features.length}`);
    console.log(`Sequence length: ${this.sequenceLength}`);

    // Normalize inputs
    const { normalized, featureMins, featureMaxs } = this.normalizeFeatures(sequences);

    // Normalize targets individually
    const { normalized: normRelease, mins: releaseMin, maxs: releaseMax } = this.normalizeTargets(releaseTargets);
    const { normalized: normDischarge, mins: dischargeMin, maxs: dischargeMax } = this.normalizeTargets(dischargeTargets);

    // Convert to tensors
    const inputTensor = tf.tensor3d(normalized);
    const releaseTensor = tf.tensor2d(normRelease);
    const dischargeTensor = tf.tensor2d(normDischarge);

    // Build multi-output model
    const inputs = tf.input({ shape: [this.sequenceLength, this.features.length] });
    const lstm1 = tf.layers.lstm({ units: 64, returnSequences: true }).apply(inputs);
    const drop1 = tf.layers.dropout({ rate: 0.2 }).apply(lstm1);
    const lstm2 = tf.layers.lstm({ units: 32, returnSequences: false }).apply(drop1);
    const drop2 = tf.layers.dropout({ rate: 0.2 }).apply(lstm2);

    // Release output head (sigmoid activation for binary classification)
    const releaseOutput = tf.layers.dense({ units: 1, activation: 'sigmoid', name: 'release' }).apply(drop2);

    // Discharge volume output head (linear activation for regression)
    const dischargeOutput = tf.layers.dense({ units: 1, activation: 'linear', name: 'discharge' }).apply(drop2);

    this.model = tf.model({ inputs, outputs: [releaseOutput, dischargeOutput] });

    this.model.compile({
      optimizer: 'adam',
      loss: {
        release: 'binaryCrossentropy',
        discharge: 'meanSquaredError'
      },
      metrics: {
        release: 'accuracy',
        discharge: 'mse'
      },
      lossWeights: {
        release: 1.0,
        discharge: 1.0
      }
    });

    console.log("Model compiled, starting training...");

    // Train model with multi-output
    const history = await this.model.fit(
      inputTensor,
      { release: releaseTensor, discharge: dischargeTensor },
      {
        epochs: 50,
        batchSize: Math.min(8, Math.floor(sequences.length / 4)),
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if ((epoch + 1) % 10 === 0) {
              console.log(`Epoch ${epoch + 1}: loss=${logs.loss.toFixed(4)}, val_loss=${logs.val_loss.toFixed(4)}`);
            }
          }
        }
      }
    );

    this.scaler = {
      featureMin: featureMins,
      featureMax: featureMaxs,
      releaseMin,
      releaseMax,
      dischargeMin,
      dischargeMax
    };

    this.modelMetadata = {
      type: "DamReleaseLSTM",
      version: "3.0.1",
      trainedAt: new Date().toISOString(),
      sequenceLength: this.sequenceLength,
      features: this.features,
      samples: sequences.length,
      finalLoss: history.history.loss[history.history.loss.length - 1]
    };

    this.trained = true;
    console.log("✅ Dam release prediction model trained successfully!");

    inputTensor.dispose();
    releaseTensor.dispose();
    dischargeTensor.dispose();

    // Save the model after training
    await this.saveModel();
  }

 async predict(weatherSequence, currentWaterLevelPercent) {
  // if (!this.trained) {
  //   throw new Error("Model not trained. Train model first.");
  // }

  await this.loadModel();

  if (weatherSequence.length !== this.sequenceLength) {
    throw new Error(`Expected ${this.sequenceLength} hours of weather data`);
  }

  // Map features with injected currentWaterLevelPercent
  const inputSequence = weatherSequence.map(weatherData =>
    this.features.map(feature => {
      if (feature === 'current_water_level_percent') return currentWaterLevelPercent;
      return weatherData[feature] !== undefined ? weatherData[feature] : 0;
    })
  );

  // Normalize using stored min/max per feature
  const normalizedInput = inputSequence.map(timestep =>
    timestep.map((value, i) => {
      const denom = this.scaler.featureMax[i] - this.scaler.featureMin[i];
      if (denom === 0) return 0;
      return (value - this.scaler.featureMin[i]) / denom;
    })
  );

  const inputTensor = tf.tensor3d([normalizedInput]);

  const [releasePred, dischargePred] = await this.model.predict(inputTensor);

  const releaseProb = releasePred.dataSync()[0];
  const dischargeValNorm = dischargePred.dataSync()[0];

  inputTensor.dispose();
  releasePred.dispose();
  dischargePred.dispose();

  // Denormalize discharge output
  let dischargeVol = dischargeValNorm * (this.scaler.dischargeMax[0] - this.scaler.dischargeMin[0]) + this.scaler.dischargeMin[0];

  return {
    releaseProbability: releaseProb,
    willRelease: releaseProb >= 0.5,
    estimatedDischarge: Math.max(0, dischargeVol)
  };
}


  async saveModel(modelDir = 'saved_dam_model') {
    if (!this.trained) throw new Error('Train model first');

    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    await this.model.save(`file://${modelDir}`);
    fs.writeFileSync(path.join(modelDir, 'scaler.json'), JSON.stringify(this.scaler, null, 2));
    fs.writeFileSync(path.join(modelDir, 'metadata.json'), JSON.stringify(this.modelMetadata, null, 2));
    console.log(`✅ Model saved to ${modelDir}/`);
  }

  async loadModel(modelDir = 'saved_dam_model') {
    this.model = await tf.loadLayersModel(`file://${modelDir}/model.json`);
    this.scaler = JSON.parse(fs.readFileSync(path.join(modelDir, 'scaler.json')));
    this.modelMetadata = JSON.parse(fs.readFileSync(path.join(modelDir, 'metadata.json')));
    this.trained = true;
    console.log('✅ Dam release model loaded successfully!');
  }

  getModelInfo() {
    if (!this.trained) return { status: 'No model loaded' };
    return {
      status: 'Model ready',
      type: this.modelMetadata.type,
      version: this.modelMetadata.version,
      trainedAt: this.modelMetadata.trainedAt,
      features: this.features,
      featureCount: this.features.length,
      sequenceLength: this.sequenceLength
    };
  }
}

module.exports = DamReleaseLSTMPredictor;
