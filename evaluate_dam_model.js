// evaluate_dam_model.js
// Usage: node evaluate_dam_model.js
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');

const MODEL_DIR = 'saved_dam_model';
const TEST_DATA_FILE = 'test_data.json'; // you must provide -> explained below
const SEQUENCE_LENGTH = 24;
const FEATURES = [
  'rainfall_1h','rainfall_6h','rainfall_24h',
  'temperature_celsius','humidity','pressure','wind_speed',
  'current_water_level_percent','hour_of_day','is_monsoon_season',
  'wind_deg','wind_gust','clouds','visibility','dew_point','uvi'
];

// --- utility metrics ---
function mean(arr){ return arr.reduce((a,b)=>a+b,0)/arr.length; }
function mse(actual, pred){ return mean(actual.map((v,i)=>Math.pow(v - pred[i],2))); }
function mae(actual, pred){ return mean(actual.map((v,i)=>Math.abs(v - pred[i]))); }
function rmse(actual,pred){ return Math.sqrt(mse(actual,pred)); }
function mape(actual,pred){
  const eps = 1e-8;
  return mean(actual.map((v,i)=>Math.abs((v - pred[i])/(Math.abs(v)+eps))))*100;
}
function smape(actual,pred){
  const eps = 1e-8;
  return mean(actual.map((v,i)=>Math.abs(v - pred[i]) / ((Math.abs(v)+Math.abs(pred[i]))/2 + eps)))*100;
}
function r2(actual,pred){
  const m = mean(actual);
  const ssRes = actual.reduce((s,v,i)=> s + Math.pow(v - pred[i],2), 0);
  const ssTot = actual.reduce((s,v)=> s + Math.pow(v - m,2), 0);
  return 1 - (ssRes/ssTot);
}

// classification helpers
function confusionMatrix(labels, predsBinary){
  let tp=0, tn=0, fp=0, fn=0;
  for(let i=0;i<labels.length;i++){
    const a = labels[i], p = predsBinary[i];
    if(a===1 && p===1) tp++;
    if(a===1 && p===0) fn++;
    if(a===0 && p===1) fp++;
    if(a===0 && p===0) tn++;
  }
  return {tp,tn,fp,fn};
}
function precisionRecallF1(labels, predsBinary){
  const {tp,fp,fn} = confusionMatrix(labels, predsBinary);
  const prec = tp + fp === 0 ? 0 : tp/(tp+fp);
  const rec = tp + fn === 0 ? 0 : tp/(tp+fn);
  const f1 = (prec+rec) === 0 ? 0 : 2*prec*rec/(prec+rec);
  return {precision:prec, recall:rec, f1};
}
// AUC (ROC) via trapezoidal rule
function computeAUC(labels, scores){
  // sort by descending score
  const paired = labels.map((l,i)=>({l,score:scores[i]})).sort((a,b)=>b.score - a.score);
  let tp=0, fp=0;
  const P = labels.reduce((s,v)=>s + (v===1?1:0),0);
  const N = labels.length - P;
  const points = [{fp:0,tp:0}];
  for(const p of paired){
    if(p.l===1) tp++; else fp++;
    points.push({fp:fp/N, tp:tp/P});
  }
  // trapezoidal area
  let auc = 0;
  for(let i=1;i<points.length;i++){
    const x1 = points[i-1].fp, x2 = points[i].fp;
    const y1 = points[i-1].tp, y2 = points[i].tp;
    auc += (x2 - x1) * (y1 + y2) / 2;
  }
  return auc;
}

// --- prepare sequences from raw test array ---
// Expect test_data.json to be an array of chronological samples with fields:
// all features from FEATURES plus 'release_occurred' (0/1) and 'discharge_volume' numeric.
// We will form sequences of length SEQUENCE_LENGTH and predict for the timestep after each sequence.
function prepareSequences(raw){
  const seqs = [], releaseTargets=[], dischargeTargets=[], timestamps=[];
  for(let i=SEQUENCE_LENGTH;i<raw.length;i++){
    const seq = [];
    for(let j=i-SEQUENCE_LENGTH;j<i;j++){
      const s = raw[j];
      seq.push(FEATURES.map(f => {
        const v = s[f];
        return (v === undefined || v === null || isNaN(v)) ? 0 : Number(v);
      }));
    }
    seqs.push(seq);
    const cur = raw[i];
    releaseTargets.push(Number(cur.release_occurred) || 0);
    dischargeTargets.push(releaseTargets[releaseTargets.length-1] === 1 ? (Number(cur.discharge_volume)||0) : 0);
    timestamps.push(cur.timestamp || i); // use timestamp if present
  }
  return {seqs, releaseTargets, dischargeTargets, timestamps};
}

// --- main evaluation routine ---
async function run(){
  if(!fs.existsSync(TEST_DATA_FILE)) {
    console.error(`Missing ${TEST_DATA_FILE}. Create it as an array of chronological samples with features and targets.`);
    process.exit(1);
  }

  console.log('Loading model and scaler...');
  const model = await tf.loadLayersModel(`file://${MODEL_DIR}/model.json`);
  const scaler = JSON.parse(fs.readFileSync(path.join(MODEL_DIR,'scaler.json')));
  const raw = JSON.parse(fs.readFileSync(TEST_DATA_FILE, 'utf8'));

  const {seqs, releaseTargets, dischargeTargets, timestamps} = prepareSequences(raw);
  if(seqs.length === 0){
    console.error('No sequences prepared. Ensure test_data.json has at least sequenceLength + 1 samples.');
    process.exit(1);
  }

  // normalize test sequences using saved scaler (featureMin & featureMax)
  const normSeqs = seqs.map(seq => seq.map(timestep =>
    timestep.map((val,i) => {
      const denom = scaler.featureMax[i] - scaler.featureMin[i];
      if(denom === 0) return 0;
      return (val - scaler.featureMin[i]) / denom;
    })
  ));

  // predict in batches
  const inputTensor = tf.tensor3d(normSeqs);
  const preds = model.predict(inputTensor);
  // preds is array-like [release, discharge] or a single tensor if single output
  let releaseScores, dischargePreds;
  if(Array.isArray(preds)){
    releaseScores = preds[0].dataSync();
    dischargePreds = preds[1].dataSync();
    preds[0].dispose(); preds[1].dispose();
  } else {
    // unlikely in your model but handle
    console.error('Model returned single tensor — expected two outputs.');
    process.exit(1);
  }
  inputTensor.dispose();

  // denormalize discharge predictions using scaler
  const dMin = scaler.dischargeMin[0];
  const dMax = scaler.dischargeMax[0];
  const dischargeDenorm = Array.from(dischargePreds).map(v => v * (dMax - dMin) + dMin);

  // classification metrics
  const labels = releaseTargets;
  const scores = Array.from(releaseScores);
  const predsBinary = scores.map(s => s >= 0.5 ? 1 : 0);
  const {precision, recall, f1} = precisionRecallF1(labels, predsBinary);
  const {tp,tn,fp,fn} = confusionMatrix(labels, predsBinary);
  const acc = (tp + tn) / labels.length;
  const auc = computeAUC(labels, scores);

  // regression metrics (only for samples where true discharge > 0 OR we evaluate over all)
  const actualDischarge = dischargeTargets;
  const mae_v = mae(actualDischarge, dischargeDenorm);
  const mse_v = mse(actualDischarge, dischargeDenorm);
  const rmse_v = Math.sqrt(mse_v);
  const mape_v = mape(actualDischarge, dischargeDenorm);
  const smape_v = smape(actualDischarge, dischargeDenorm);
  const r2_v = r2(actualDischarge, dischargeDenorm);

  console.log('--- Classification (release) ---');
  console.log(`Samples: ${labels.length}, Accuracy: ${acc.toFixed(4)}, Precision: ${precision.toFixed(4)}, Recall: ${recall.toFixed(4)}, F1: ${f1.toFixed(4)}, AUC: ${auc.toFixed(4)}`);
  console.log('Confusion:', {tp,fp,fn,tn});
  console.log('--- Regression (discharge) ---');
  console.log(`MAE: ${mae_v.toFixed(4)}, RMSE: ${rmse_v.toFixed(4)}, R2: ${r2_v.toFixed(4)}, MAPE: ${mape_v.toFixed(2)}%, sMAPE: ${smape_v.toFixed(2)}%`);

  // Prepare report JSON
  const report = {
    meta: {
      samples: labels.length,
      sequenceLength: SEQUENCE_LENGTH,
      modelDir: MODEL_DIR
    },
    classification: {
      labels, scores, predsBinary,
      metrics: {accuracy: acc, precision, recall, f1, auc, tp,fp,fn,tn}
    },
    regression: {
      actual: actualDischarge,
      predicted: dischargeDenorm,
      timestamps,
      metrics: {mae: mae_v, rmse: rmse_v, mse: mse_v, r2: r2_v, mape: mape_v, smape: smape_v}
    }
  };

  fs.writeFileSync('evaluation_report_data.json', JSON.stringify(report, null, 2));
  console.log('Wrote evaluation_report_data.json');

  // Build HTML report (self-contained) - Chart.js for plots
  const html = `
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Dam Model Evaluation Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>body{font-family:Arial;padding:20px}canvas{max-width:1000px;margin-bottom:30px}</style>
</head>
<body>
<h1>Dam Model Evaluation Report</h1>
<p>Open this in a browser. Data file: <code>evaluation_report_data.json</code></p>

<h2>Classification — ROC & PR</h2>
<canvas id="roc"></canvas>
<canvas id="pr"></canvas>

<h2>Regression — Actual vs Predicted (time series)</h2>
<canvas id="timeseries"></canvas>

<h2>Regression — Scatter Actual vs Predicted</h2>
<canvas id="scatter"></canvas>

<h2>Regression — Residuals Histogram</h2>
<canvas id="residuals"></canvas>

<script>
const report = ${JSON.stringify(report)};

// --- ROC calculation for plotting (compute TPR/FPR curve) ---
function computeROCCurve(labels, scores){
  const paired = labels.map((l,i)=>({l,score:scores[i]})).sort((a,b)=>b.score - a.score);
  const P = labels.reduce((s,v)=>s + (v===1?1:0),0);
  const N = labels.length - P;
  let tp=0, fp=0;
  const pts = [{fpr:0,tpr:0}];
  for(const p of paired){
    if(p.l===1) tp++; else fp++;
    pts.push({fpr: fp/N, tpr: tp/P});
  }
  return pts;
}
const rocPts = computeROCCurve(report.classification.labels, report.classification.scores);
// PR curve (precision vs recall)
function computePRCurve(labels, scores){
  const paired = labels.map((l,i)=>({l,score:scores[i]})).sort((a,b)=>b.score - a.score);
  let tp=0, fp=0;
  const P = labels.reduce((s,v)=>s + (v===1?1:0),0);
  const pts = [];
  for(let i=0;i<paired.length;i++){
    if(paired[i].l===1) tp++; else fp++;
    const prec = tp / (tp + fp);
    const rec = tp / P;
    pts.push({recall:rec, precision: prec});
  }
  return pts;
}
const prPts = computePRCurve(report.classification.labels, report.classification.scores);

// Timeseries plot data
const tsLabels = report.regression.timestamps.map(t=>String(t));
const actual = report.regression.actual;
const predicted = report.regression.predicted;
const resid = actual.map((a,i)=> a - predicted[i]);

// Plot ROC
new Chart(document.getElementById('roc'), {
  type: 'line',
  data: {
    labels: rocPts.map((p,i)=>i),
    datasets: [
      { label: 'ROC (TPR)', data: rocPts.map(p=>p.tpr), fill:false, tension:0.1 },
      { label: 'FPR (for reference)', data: rocPts.map(p=>p.fpr), fill:false, tension:0.1, borderDash:[5,5] }
    ]
  },
  options: { scales:{ x:{ display:false }, y:{ beginAtZero:true, max:1 } } }
});

// Plot PR
new Chart(document.getElementById('pr'), {
  type: 'line',
  data: {
    labels: prPts.map((p,i)=>i),
    datasets: [
      { label: 'Precision', data: prPts.map(p=>p.precision), fill:false, tension:0.1 },
      { label: 'Recall', data: prPts.map(p=>p.recall), fill:false, tension:0.1, borderDash:[5,5] }
    ]
  },
  options: { scales:{ x:{ display:false }, y:{ beginAtZero:true, max:1 } } }
});

// Time series Actual vs Predicted
new Chart(document.getElementById('timeseries'), {
  type: 'line',
  data: {
    labels: tsLabels,
    datasets: [
      { label:'Actual discharge', data: actual, fill:false, tension:0.1 },
      { label:'Predicted discharge', data: predicted, fill:false, tension:0.1 }
    ]
  },
  options: { scales:{ x:{ display:true, ticks:{maxTicksLimit:12} } } }
});

// Scatter actual vs predicted
new Chart(document.getElementById('scatter'), {
  type: 'scatter',
  data: {
    datasets: [{
      label: 'Actual vs Predicted',
      data: actual.map((a,i)=>({x:a, y: predicted[i]}))
    }]
  },
  options: {
    scales: {
      x: { title:{display:true, text:'Actual'} },
      y: { title:{display:true, text:'Predicted'} }
    }
  }
});

// Residual histogram (simple)
function histogram(data, bins=40){
  const min = Math.min(...data), max = Math.max(...data);
  const width = (max - min + 1e-9)/bins;
  const counts = new Array(bins).fill(0);
  for(const v of data){
    const idx = Math.min(bins-1, Math.floor((v - min)/width));
    counts[idx] += 1;
  }
  const centers = counts.map((c,i)=> min + (i+0.5)*width);
  return {centers, counts};
}
const hist = histogram(resid, 40);
new Chart(document.getElementById('residuals'), {
  type: 'bar',
  data: { labels: hist.centers.map(c=>c.toFixed(2)), datasets: [{ label:'Residuals', data: hist.counts }]},
  options: { scales:{ x:{ display:false } } }
});
</script>
</body>
</html>
  `;

  fs.writeFileSync('evaluation_report.html', html);
  console.log('Wrote evaluation_report.html — open this in a browser to view charts.');
}

run().catch(err=>{
  console.error(err);
  process.exit(1);
});
