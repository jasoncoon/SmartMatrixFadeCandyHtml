var connect = require('connect'),
    http = require('http'),
    directory = './';

connect()
    .use(connect.static(directory))
    .listen(8080);