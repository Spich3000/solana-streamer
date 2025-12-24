export const health = {
    wsConnected: false,
    firstBlockReceived: false,
};

export function healthHandler(_: any, res: any) {
    if (health.wsConnected) {
        res.statusCode = 200;
        res.end("ok");
    } else {
        res.statusCode = 503;
        res.end("ws not connected");
    }
}

export function readyHandler(_: any, res: any) {
    if (health.firstBlockReceived) {
        res.statusCode = 200;
        res.end("ready");
    } else {
        res.statusCode = 503;
        res.end("not ready");
    }
}