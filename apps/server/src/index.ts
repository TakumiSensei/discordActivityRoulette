import dotenv from "dotenv";
dotenv.config({ path: ".env" });
/**
 * IMPORTANT:
 * ---------
 * Do not manually edit this file if you'd like to host your server on Colyseus Cloud
 *
 * If you're self-hosting (without Colyseus Cloud), you can manually
 * instantiate a Colyseus Server as documented here:
 *
 * See: https://docs.colyseus.io/server/api/#constructor-options
 */
import { listen } from "@colyseus/tools";

// Import Colyseus config
import app from "./app.config";

// Cloud Run対応: PORT環境変数があればそれを使う
const port = process.env.PORT ? Number(process.env.PORT) : 2567;
listen(app, port);
