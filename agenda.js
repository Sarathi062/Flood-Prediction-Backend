const Agenda = require("agenda");
const floodPredict = require("./jobs/update");

const mongoUrl = process.env.MONGO_URI;

async function startAgenda() {
  const agenda = new Agenda({
    // Use a separate collection for Agenda's internal docs to avoid mixing with app data
    db: { address: mongoUrl, collection: "agendaJobs" },
  });

  // Define the job once
  agenda.define("daily-db-update", async () => {
    await floodPredict();
  });

  await agenda.start();

  // Register a single repeatable job (idempotent)
  await agenda.every(
    "0 2,14 * * *", // 02:00 and 14:00 daily
    "daily-db-update",
    {}, // job data
    {
      timezone: "Asia/Kolkata",
      skipImmediate: true, // don't run immediately on boot
      unique: { name: "daily-db-update" }, // prevent duplicate repeatables
    }
  );

  // Manual kick for testing (remove in prod if you don’t want an immediate run)
  //   await agenda.now("daily-db-update");

  return agenda;
}

module.exports = startAgenda;
