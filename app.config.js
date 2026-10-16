const app = require("./app.json").expo;
delete app.android.name;
module.exports = app;
