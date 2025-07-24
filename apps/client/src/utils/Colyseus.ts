import { Client } from "colyseus.js";

// export const colyseusSDK = new Client('https://meet-hunt-kazakhstan-attraction.trycloudflare.com');
// export const colyseusSDK = new Client('https://de-fra-90499d00.colyseus.dev');
// export const colyseusSDK = new Client('/colyseus');
const queryParams = new URLSearchParams(window.location.search);
const isEmbedded = queryParams.get('frame_id') != null;

export const colyseusSDK = new Client(isEmbedded ? '/.proxy/colyseus' : '/colyseus');