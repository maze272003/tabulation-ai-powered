import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./betterAuth/auth";
import { paymongoWebhook } from "./billing/webhook";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);
http.route({
  path: "/paymongo/webhook",
  method: "POST",
  handler: paymongoWebhook,
});

export default http;
