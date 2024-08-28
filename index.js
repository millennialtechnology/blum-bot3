import { Blum } from "./src/blum/blum.js";
import { Config } from "./src/config/config.js";
import { proxyList } from "./src/config/proxy_list.js";
import { Telegram } from "./src/core/telegram.js";
import { Helper } from "./src/utils/helper.js";
import logger from "./src/utils/logger.js";

async function operation(acc, query, queryObj, proxy) {
  logger.clear();
  try {
    const blum = new Blum(acc, query, queryObj, proxy);

    await blum.login();
    await blum.getUser(true);
    await blum.getBalance(true);
    await blum.getTasks();
    await blum.checkIn();
    if (blum.balance.farming) {
      if (Helper.isFutureTime(blum.balance.farming.endTime)) {
        await blum.claim();
      }
    }
    await blum.mining();
    const uncompletableTaskIds = [
      "a90d8b81-0974-47f1-bb00-807463433bde",
      "03e4a46f-7588-4950-8289-f42787e3eca2",
    ];

    const uncompletedTasks = blum.tasks.filter(
      (task) =>
        task.status !== "FINISHED" &&
        task.type !== "WALLET_CONNECTION" &&
        task.type !== "PROGRESS_TARGET" &&
        !uncompletableTaskIds.includes(task.id) &&
        task.subtask != undefined
    );
    for (const task of uncompletedTasks) {
      if (task.status === "NOT_STARTED") {
        await blum.startAndCompleteTask(task.id);
      } else {
        await blum.completeTask(task.id);
      }
    }

    while (blum.balance.playPasses > 0) {
      var err = false;
      await blum.play().catch(() => {
        err = true;
      });
      if (err) {
        await Helper.delay(
          3000,
          acc,
          "Failed to play game something wen't wrong"
        );
        logger.error(err);
        break;
      }
    }
    await Helper.delay(
      3000,
      acc,
      "Account Processing done, continue using next account",
      blum
    );
  } catch (error) {
    await Helper.delay(
      10000,
      acc,
      `Error : ${error}, Retrying after 10 Second`
    );
    await operation(acc, query, queryObj, proxy);
  }
}

let init = false;
async function startBot() {
  return new Promise(async (resolve, reject) => {
    try {
      logger.info(`BOT STARTED`);
      if (
        Config.TELEGRAM_APP_ID == undefined ||
        Config.TELEGRAM_APP_HASH == undefined
      ) {
        throw new Error(
          "Please configure your TELEGRAM_APP_ID and TELEGRAM_APP_HASH first"
        );
      }

      const tele = await new Telegram();
      if (init == false) {
        await tele.init();
        init = true;
      }

      const sessionList = Helper.getSession("sessions");
      const paramList = [];

      if (proxyList.length > 0) {
        if (sessionList.length != proxyList.length) {
          reject(
            `You have ${sessionList.length} Session but you provide ${proxyList.length} Proxy`
          );
        }
      }

      for (const acc of sessionList) {
        const accIdx = sessionList.indexOf(acc);
        const proxy = proxyList.length > 0 ? proxyList[accIdx] : undefined;

        await tele.useSession("sessions/" + acc, proxy);
        tele.session = acc;
        const user = await tele.client.getMe();
        const query = await tele
          .resolvePeer()
          .then(async () => {
            return await tele.initWebView();
          })
          .catch((err) => {
            throw err;
          });

        const queryObj = Helper.queryToJSON(query);
        await tele.disconnect();
        paramList.push([user, query, queryObj, proxy]);
      }

      const promiseList = paramList.map(async (data) => {
        await operation(data[0], data[1], data[2], data[3]);
      });

      await Promise.all(promiseList);
      resolve();
    } catch (error) {
      logger.info(`BOT STOPPED`);
      logger.error(JSON.stringify(error));
      reject(error);
    }
  });
}

(async () => {
  try {
    logger.info("");
    logger.clear();
    logger.info("Application Started");
    await startBot();
  } catch (error) {
    console.error("Error in main process:", error);
    logger.info(`Application Error : ${error}`);
    throw error;
  }
})();
