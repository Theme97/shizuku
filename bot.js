(function() {
  var IRC, ModuleHandler, bot, bots, config, fs, id, settings;
  var __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };
  IRC = (function() {
    function IRC(bot) {
      this.bot = bot;
      this.buffer = '';
      this.channels = {};
      this.connect(this.bot.config.server);
    }
    IRC.prototype.connect = function(server) {
      if (server.ssl) {
        this.socket = require('tls').connect(server.port, server.host, __bind(function() {
          return this.socket.emit('connect');
        }, this));
      } else {
        this.socket = require('net').createConnection(server.port, server.host);
      }
      this.socket.on('connect', __bind(function() {
        this.socket.setNoDelay();
        this.socket.setEncoding('utf8');
        if (server.pass !== '') {
          this.sendRaw("PASS " + server.pass);
        }
        this.sendRaw("NICK " + this.bot.config.bot.nick);
        this.sendRaw("USER " + this.bot.config.bot.user + " 0 * :" + this.bot.config.bot.real);
      }, this));
      this.socket.on('data', __bind(function(data) {
        var line, lines, _i, _len;
        lines = (this.buffer + data).split('\r\n');
        this.buffer = lines.pop();
        for (_i = 0, _len = lines.length; _i < _len; _i++) {
          line = lines[_i];
          console.log("[" + server.host + "] >> " + line);
          this.handle(line);
        }
      }, this));
    };
    IRC.prototype.sendRaw = function(data) {
      return this.socket.write(data + '\r\n', 'utf8', __bind(function() {
        return console.log("[" + this.bot.config.server.host + "] << " + data);
      }, this));
    };
    IRC.prototype.joinChannel = function(channel, key) {
      if (key == null) {
        key = '';
      }
      this.channels[channel.toLowerCase()] = {
        topic: {},
        users: {}
      };
      return this.sendRaw("JOIN " + channel + " " + key);
    };
    IRC.prototype.handle = function(data) {
      var channel, cmd, from, match, msg, nick, to, topic, users, _base, _base2, _i, _j, _len, _len2, _ref, _ref2, _ref3, _ref4, _ref5, _ref6;
      if (data[0] !== ':') {
        data = data.split(' ');
        if (data[0] === 'PING') {
          this.sendRaw("PONG " + data[1]);
        }
      } else {
        _ref = data.substr(1).split(':', 2), data = _ref[0], msg = _ref[1];
        data = data.split(' ');
        if (isNaN(parseInt(data[1]))) {
          from = data[0], cmd = data[1], to = data[2];
          match = from.match(/(.+)!(.+)@(.+)/);
          from = {
            full: from,
            nick: match != null ? match[1] : '',
            ident: match != null ? match[2] : '',
            host: match != null ? match[3] : ''
          };
          switch (cmd) {
            case 'PRIVMSG':
              if ((msg[0] === (_ref2 = msg.substr(-1)) && _ref2 === '\x01')) {
                this.bot.modules.emit('onCtcp', [from, to, msg.substr(1, -1)]);
              } else {
                this.bot.modules.emit('onPrivmsg', [from, to, msg]);
              }
          }
          this.bot.modules.emit('onClientMsg', [data, cmd, to, msg]);
        } else {
          switch (data[1]) {
            case '331':
              this.channels[data[3].toLowerCase()].topic = {
                text: '',
                user: '',
                time: ''
              };
              break;
            case '332':
                            if ((_ref3 = (_base = this.channels[data[3].toLowerCase()].topic).text) != null) {
                _ref3;
              } else {
                _base.text = msg;
              };
              break;
            case '333':
              topic = this.channels[data[3].toLowerCase()].topic;
              topic.user = data[4];
              topic.time = data[5];
              break;
            case '353':
              users = ((_ref4 = (_base2 = this.channels[data[4].toLowerCase()]).users) != null ? _ref4 : _base2.users = {});
              _ref5 = msg.split(' ');
              for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
                nick = _ref5[_i];
                if (nick !== '') {
                  if ('~&@%+'.indexOf(nick[0]) !== -1) {
                    users[nick.substr(1)] = nick[0];
                  } else {
                    users[nick] = '';
                  }
                }
              }
              break;
            case '366':
              break;
            case '376':
            case '422':
              this.sendRaw("MODE " + this.bot.config.bot.nick + " +B");
              _ref6 = this.bot.config.channels;
              for (_j = 0, _len2 = _ref6.length; _j < _len2; _j++) {
                channel = _ref6[_j];
                this.joinChannel(channel);
              }
          }
          this.bot.modules.emit('onServerMsg', [data, msg]);
        }
      }
    };
    return IRC;
  })();
  fs = require('fs');
  try {
    config = fs.readFileSync("" + __dirname + "/config.json", 'utf8');
  } catch (e) {
    console.error("[ERROR] config.json: " + e.message);
    console.error("[ERROR] config.json: error opening file");
    process.exit(1);
  }
  try {
    config = JSON.parse(config);
  } catch (e) {
    console.error("[ERROR] config.json: " + e.message);
    console.error("[ERROR] config.json: error parsing file");
    process.exit(1);
  }
  ModuleHandler = (function() {
    function ModuleHandler(bot) {
      this.bot = bot;
      this.modules = {};
    }
    ModuleHandler.prototype.load = function(module) {
      var path;
      path = require.resolve(module);
      delete require.cache[path];
      this.modules[module] = require(module).init(this.bot);
      return console.log("loaded module '" + module + "'");
    };
    ModuleHandler.prototype.reload = function() {
      var module, _i, _len, _ref;
      _ref = this.modules;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        module = _ref[_i];
        this.load(module);
      }
    };
    ModuleHandler.prototype.emit = function(event, data) {
      var $, module, _ref, _results;
      _ref = this.modules;
      _results = [];
      for ($ in _ref) {
        module = _ref[$];
        _results.push(module[event] != null ? module[event].apply(module, data) : void 0);
      }
      return _results;
    };
    return ModuleHandler;
  })();
  bot = (function() {
    function bot(config) {
      var module, _i, _len, _ref;
      this.config = config;
      this.modules = new ModuleHandler(this);
      _ref = this.config.modules;
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        module = _ref[_i];
        this.modules.load(module);
      }
    }
    bot.prototype.connect = function() {
      return this.irc = new IRC(this);
    };
    return bot;
  })();
  bots = {};
  for (id in config) {
    settings = config[id];
    (bots[id] = new bot(settings)).connect();
  }
}).call(this);
