import { FalkorDB } from "falkordb";
import { env } from "../config/env.js";

let connectionPromise: ReturnType<typeof FalkorDB.connect> | undefined;

export async function connectDB() {
    if (!connectionPromise) {
        const { host, port, password } = env.falkordb;
        connectionPromise = FalkorDB.connect({
            host,
            port,
            ...(password ? { password } : {}),
        }).catch((error: unknown) => {
            connectionPromise = undefined;
            throw error;
        });
    }

    const db = await connectionPromise;
    return db.selectGraph("my_graph");
}
