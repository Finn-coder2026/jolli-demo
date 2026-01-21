import "./util/Env";
import { createAndStartServer } from "./AppFactory";

const app = await createAndStartServer();

export const viteNodeApp = app;
