const http = require("http"),
  fs = require("fs"),
  path = require("path");
const root = path.resolve(__dirname, "../../website");
http
  .createServer((req, res) => {
    if (req.url === "/chat-config.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(
        'window.CHAT_CONFIG={firebase:{apiKey:"demo-key",authDomain:"demo-sidequest.firebaseapp.com",databaseURL:"https://demo-sidequest-default-rtdb.firebaseio.com",projectId:"demo-sidequest",appId:"demo"},region:"us-central1",emulator:true};',
      );
    }
    const file = path.resolve(
      root,
      "." + decodeURIComponent(req.url.split("?")[0]),
    );
    if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(file, (e, b) => {
      if (e) return res.writeHead(404).end();
      res.setHeader(
        "Content-Type",
        file.endsWith(".js")
          ? "text/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : "text/html",
      );
      res.end(b);
    });
  })
  .listen(8099, "127.0.0.1", () => console.log("Chat test server 8099"));
