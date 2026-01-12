const { app } = require("@azure/functions");
const { logger } = require("@vestfoldfylke/loglady");
const config = require("../../config");
const { activateSubstitutions } = require("../lib/jobs/graphJobs");
const { logToDB } = require("../lib/jobs/logToDB");

app.timer("activateSubstitutions", {
  schedule: "0 */15 * * * *",
  handler: async (_myTimer, context) => {
    if (["true", true].includes(config.APP_DEACTIVATE_TIMERS)) return;
    try {
      await activateSubstitutions(false, undefined, context);
    } catch (error) {
      logger.errorException(error, "activateSubstitutions - An error occured while trying to activate substitutions");
      await logToDB("error", error, undefined, context);
    }
  }
});
