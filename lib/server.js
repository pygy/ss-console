/*
  Console Server
  --------------
  Listen out for incoming remote console connections
*/

require('colors');

var net = require('net'),
    repl = require('repl');

var port = null,
    Sockets = [],
    msgQueue = [];

module.exports = function(socketStream) {

  var ss = socketStream.api;

  ss.consoleVersion = '0.1.3';

  // Wait until SocketStream core has started
  socketStream.events.on('server:start', function(serverInstance) {

    // Only start if port has been set with .listen()
    if (!port) return false;

    ss.log("i".green, "Console Server running on port " + port);

    var server = net.createServer(function(socket) {

      // Flush the message queue if needed.
      Sockets.push(socket);
      msgQueue.forEach(function(msg){ socket.write(msg + "\n"); })
      msgQueue = [];

      var sessionID = ss.session.create();

      // Handle client disconnections
      socket.on('error',function(er){
        ss.log("←".red, ("Session ID " + sessionID + " - Console socket error:").grey);
        ss.log(JSON.stringify(er));
      });
      socket.on('end',function(er){
        ss.log("←".green, ("Session ID " + sessionID + " - Console client has disconnected").grey);
      });
      socket.on('close', function() {
        Sockets.splice(Sockets.indexOf(socket),1)
      });

      // Make all Request Responders with a 'console' interface available over the REPL
      for (var id in serverInstance.responders) {

        var responder = serverInstance.responders[id];

        if (responder.interfaces.internal && responder.name) {

          // Append to the ss API
          ss[responder.name] = function() {

            var start = Date.now();
            var args = Array.prototype.slice.call(arguments);
            var meta = { sessionId: sessionID, transport: 'console' };

            var cb = function(err, params) {

              // Send errors back to the console
              if (err) {

                if (err.stack) {
                  var lines = err.stack.split("\n");
                  var firstLine = lines[0].red;
                  var msg = [firstLine].concat(lines.slice(1)).join("\n");
                  socket.write(msg);
                } else {
                  socket.write(JSON.stringify(err));
                }

              // Send a normal response
              } else {
                var timeTaken = Date.now() - start;
                socket.write(((responder.name.toUpperCase()) + " responder replied in " + timeTaken + "ms with:\n").grey);
                socket.write(JSON.stringify(params) + "\n");
              }
            };

            return responder.interfaces.internal(args, meta, cb);
          };
        }
      }

      ss.log("→".cyan, ("Session ID " + sessionID + " - Console client has connected").grey);

      var replOptions = {
        prompt:       socket.remoteAddress + ':' + socket.remotePort + ' > ',
        input:        socket,
        output:       socket,
        terminal:     true,
        useGlobal:    true
      };
      
      // Start a REPL for this client
      var rconsole = repl.start(replOptions);
      rconsole.context.ss = ss;

    });
    
    server.listen(port);

  });


  return {
    listen: function(p) {
      if (!p) p = 5000;
      if (!(Number(p) > 0)) throw new Error('ss-console port number to listen on is not valid');
      return port = p;
    },
    write: function(msg){
      if(Sockets.length === 0){
        msgQueue.push(msg);
      } else {
        Sockets.forEach(function(socket){ socket.write(msg+"\n"); });
      }
    }
  };
};
