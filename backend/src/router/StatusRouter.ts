import express, { type Router } from "express";

export function createStatusRouter(): Router {
	const router = express.Router();

	router.get("/check", (_req, res) => {
		res.send("OK");
	});

	return router;
}
