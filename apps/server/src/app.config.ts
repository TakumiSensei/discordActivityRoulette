import config from "@colyseus/tools";
import { monitor } from "@colyseus/monitor";
import { playground } from "@colyseus/playground";
import { auth, JWT } from "@colyseus/auth";
import express from "express";
import cors from "cors";

/**
 * Import your Room files
 */
import { MyRoom } from "./rooms/MyRoom";

export default config({
    initializeGameServer: (gameServer) => {
        /**
         * Define your room handlers:
         */
        gameServer.define('my_room', MyRoom)
            .filterBy(['channelId']);
    },

    initializeExpress: (app) => {
        // CORS設定を追加（Discord Activity対応）
        app.use(cors({
            origin: true,
            credentials: true
        }));
        
        // 静的ファイル配信を追加
        app.use(express.static("public"));
        /**
         * Bind your custom express routes here:
         * Read more: https://expressjs.com/en/starter/basic-routing.html
         */
        app.get("/hello_world", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
        });

        //
        // Discord Embedded SDK: Retrieve user token when under Discord/Embed
        //
        app.post(["/discord_token", "/colyseus/discord_token"], async (req, res) => {
          //
          // TODO: remove this on production
          //
          if (req.body.code === "mock_code") {
            const user = {
              id: Math.random().toString(36).slice(2, 10),
              username: `User ${Math.random().toString().slice(2, 10)}`,
            }
            res.send({ access_token: "mocked", token: await JWT.sign(user), user });
            return;
          }

          try {
            //
            // Retrieve access token from Discord API
            //
            const response = await fetch(`https://discord.com/api/oauth2/token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: req.body.code,
              }),
            });

            const { access_token } = await response.json();

            //
            // Retrieve user data from Discord API
            // https://discord.com/developers/docs/resources/user#user-object
            //
            const profile = await (await fetch(`https://discord.com/api/users/@me`, {
              method: "GET",
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${access_token}`,
              }
            })).json();

            // TODO: store user profile into a database
            const user = profile;

            res.send({
              access_token, // Discord Access Token
              token: await JWT.sign(user), // Colyseus JWT token
              user // User data
            });

          } catch (e: any) {
            res.status(400).send({ error: e.message });
          }
        });

        /**
         * Use @colyseus/playground
         * (It is not recommended to expose this route in a production environment)
         */
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }

        /**
         * Use @colyseus/monitor
         * It is recommended to protect this route with a password
         * Read more: https://docs.colyseus.io/tools/monitor/#restrict-access-to-the-panel-using-a-password
         */
        app.use("/colyseus", monitor());

        //
        // See more about the Authentication Module:
        // https://docs.colyseus.io/authentication/
        //
        // app.use(auth.prefix, auth.routes())
        //
    },


    beforeListen: () => {
        /**
         * Before before gameServer.listen() is called.
         */
    }
});
