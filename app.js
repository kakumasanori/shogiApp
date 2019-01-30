const express = require('express');
const app = express();
const http = require('http');
const server = http.Server(app);
const io = require('socket.io').listen(server);
const PORT = process.env.PORT || 7000;

// const cookieParser = require('cookie-parser');
// app.use(cookieParser());

// app.set('trust proxy', 1);
const session = require('express-session');
const sessionMiddleware = session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true
  // rolling: true,
  // name: 'cookie',
  // cookie: {
  //   maxAge: 1000 * 10 // 10s
  // }
});
app.use(sessionMiddleware);
io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res, next);
});

app.use(express.static('public'));

const ejs = require('ejs');
const qs = require('querystring');
const MongoClient = require('mongodb').MongoClient;
const mongoUrl = 'mongodb://localhost/shogi';

app.get('/', (req, res) => {
  const username = req.session.username;
  res.render('./index.ejs', {
    username: username
  });
});

app.get('/signin', (req, res) => {
  const url = req.headers.referer;
  const pos = url.indexOf('room');
  if (pos >= 0) {
    req.session.room = url.slice(pos);
  }
  const username = req.session.username;
  if (username) {
    res.redirect('/');
    return;
  }
  const message = req.session.message;
  req.session.message = null;
  res.render('./signin.ejs', {
    message: message
  });
});

app.post('/signin', (req, res) => {
  req.data = '';
  req.on('data', data => {
    req.data += data;
  });
  req.on('end', async () => {
    const query = qs.parse(req.data);
    const name = query.name;
    const pass = query.pass;
    let client;
    try {
      client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
      const db = client.db('shogi');
      const collection = db.collection('users');
      const user = await collection.findOne({name: name, pass: pass});
      if (!user) {
        req.session.message = '名前またはパスワードが違います';
        res.redirect('/signin');
        return;
      }
      const room = req.session.room;
      req.session.room = null;
      req.session.username = user.name;
      if (room) {
        res.redirect('/' + room);
      } else {
        res.redirect('/');
      }
    } catch (e) {
      console.log(e);
    } finally {
      client.close();
    }
  });
});

app.get('/signup', (req, res) => {
  const username = req.session.username;
  if (username) {
    res.redirect('/');
    return;
  }
  const message = req.session.message;
  req.session.message = null;
  res.render('./signup.ejs', {
    message: message
  });
});

app.post('/signup', (req, res) => {
  req.data = '';
  req.on('data', data => {
    req.data += data;
  });
  req.on('end', async () => {
    const query = qs.parse(req.data);
    const name = query.name;
    const pass = query.pass;
    if (!name || !pass) {
      return;
    }
    let client;
    try {
      client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
      const db = client.db('shogi');
      const collection = db.collection('users');
      const user = await collection.findOne({name: name});
      if (user) {
        req.session.message = '既に登録されている名前です';
        res.redirect('/signup');
      } else {
        await collection.insertOne({name: name, pass: pass, rating: 1500});
        req.session.message = '登録が完了しました';
        res.redirect('/signin');
      }
    } catch (e) {
      console.log(e);
    } finally {
      client.close();
    }
  });
});

app.get('/signout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get(/\/room.+/, async (req, res) => {
  const username = req.session.username;
  let rating;
  if (username) {
    let client;
    try {
      client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
      const db = client.db('shogi');
      const collection = db.collection('users');
      const user = await collection.findOne({name: username});
      rating = Math.floor(user.rating);
    } catch (e) {
      console.log(e);
    } finally {
      client.close();
    }
  }
  // res.render('./room.ejs', {
  //   username: username,
  //   rating: rating
  // });
  const url = req.url;
  const pos = url.indexOf('room');
  const room = url.slice(pos);
  const roomNum = room.slice(4);
  if (roomNum >= 1 && roomNum <= 5) {
    res.render('./room.ejs', {
      username: username,
      rating: rating
    });
  }
  if (roomNum == 6) {
    res.render('./test.ejs', {
      username: username,
      rating: rating
    });
  }
});

app.get('/test', (req, res) => {
  res.render('./test.ejs', {
  });
});

io.on('connection', socket => {

  socket.on('enter_lobby', () => {
    checkPlayer(socket);
  });

  socket.on('join_room', () => {
    const username = socket.request.session.username;
    const room = getRoom(socket);
    socket.join(room);
    if (username) {
      const roomNum = room.slice(4);
      registerPlayer(socket, username, room, roomNum);
    } else {
      socket.to(room).emit('request_data', socket.id);
    }
  });

  socket.on('ready', () => {
    const room = getRoom(socket);
    startGame(socket, room);
  });

  socket.on('set_up', data => {
    const room = getRoom(socket);
    io.in(room).emit('set_up', data);
  });

  socket.on('respond_data', (socketID, data) => {
    io.to(socketID).emit('respond_data', data);
  });

  socket.on('update_time1', data => {
    const room = getRoom(socket);
    io.in(room).emit('update_time1', data);
  });

  socket.on('update_time2', data => {
    const room = getRoom(socket);
    io.in(room).emit('update_time2', data);
  });

  socket.on('update_time_b', data => {
    const room = getRoom(socket);
    io.in(room).emit('update_time_b', data);
  });

  socket.on('update_time_w', data => {
    const room = getRoom(socket);
    io.in(room).emit('update_time_w', data);
  });

  socket.on('update_game', data => {
    const room = getRoom(socket);
    io.in(room).emit('update_game', data);
  });

  socket.on('disconnect', () => {
    const username = socket.request.session.username;
    const room = getRoom(socket);
    if (username && room) {
      const roomNum = room.slice(4);
      deregisterPlayer(socket, username, room, roomNum);
    }
  });

  socket.on('exists', num => {
    const username = socket.request.session.username;
    const room = getRoom(socket);
    deregisterWaiting(username, room);
    socket.to(room).emit('exists', num);
  });

  socket.on('abort', () => {
    const room = getRoom(socket);
    const roomNum = room.slice(4);
    resetDocument(room, roomNum);
    io.in(room).emit('unset_player', 1);
    io.in(room).emit('unset_player', 2);
  })

  socket.on('end_of_the_game', data => {
    const winner = data.winner;
    const room = getRoom(socket);
    const roomNum = room.slice(4);
    calculateRating(winner, room, roomNum);
    io.in(room).emit('end_of_the_game', data);
  });

});

async function checkPlayer(socket) {
  let client;
  try {
    client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
    const db = client.db('shogi');
    for (let i = 1; i <= 6; i++) {
      const room = 'room' + i;
      const collection = db.collection(room);
      const doc = await collection.findOne();
      if (!doc) {
        continue;
      }
      if (doc.player1) {
        socket.emit('registered', i, 1);
      }
      if (doc.player2) {
        socket.emit('registered', i, 2);
      }
    }
  } catch (e) {
    console.log(e);
  } finally {
    client.close();
  }
}

function getRoom(socket) {
  const url = socket.handshake.headers.referer;
  const pos = url.indexOf('room');
  if (pos >= 0) {
    return url.slice(pos);
  }
}

async function registerPlayer(socket, username, room, roomNum) {
  let client;
  try {
    client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
    const db = client.db('shogi');
    const collection = db.collection(room);
    const doc = await collection.findOne();
    if (!doc) {
      await collection.insertOne({
        player1: username,
        player2: null,
        waiting: null,
        started: false
      });
      socket.emit('set_player', 1);
      socket.to(room).emit('unset_player', 1);
      io.emit('registered', roomNum, 1);
    }
    else if (doc.player1 === username) {
      if (!doc.started || doc.waiting !== username) {
        socket.emit('set_player', 1);
        io.in(room).emit('unset_player', 1);
      } else {
        await collection.updateOne({}, {
          $set: {
            waiting: null
          }
        });
        socket.emit('set_player', 1);
        socket.emit('check_started');
        socket.to(room).emit('unset_player', 1);
        socket.to(room).emit('exists', 1);
        socket.to(room).emit('request_data', socket.id);
      }
    }
    else if (doc.player2 === username) {
      if (!doc.started || doc.waiting !== username) {
        socket.emit('set_player', 2);
        io.in(room).emit('unset_player', 2);
      } else {
        await collection.updateOne({}, {
          $set: {
            waiting: null
          }
        });
        socket.emit('set_player', 2);
        socket.emit('check_started');
        socket.to(room).emit('unset_player', 2);
        socket.to(room).emit('exists', 2);
        socket.to(room).emit('request_data', socket.id);
      }
    }
    else if (!doc.player1) {
      await collection.updateOne({}, {
        $set: {
          player1: username
        }
      });
      socket.emit('set_player', 1);
      socket.to(room).emit('unset_player', 1);
      socket.to(room).emit('ready');
      io.emit('registered', roomNum, 1);
    }
    else if (!doc.player2) {
      await collection.updateOne({}, {
        $set: {
          player2: username
        }
      });
      socket.emit('set_player', 2);
      socket.to(room).emit('unset_player', 2);
      socket.to(room).emit('ready');
      io.emit('registered', roomNum, 2);
    }
    else {
      socket.to(room).emit('request_data', socket.id);
    }
  } catch (e) {
    console.log(e);
  } finally {
    client.close();
  }
}

async function startGame(socket, room) {
  let client;
  try {
    client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
    const db = client.db('shogi');
    const collection = db.collection(room);
    const doc = await collection.findOne();
    if (!doc.started) {
      await collection.updateOne({}, {
        $set: {
          started: true
        }
      });
      socket.emit('start_game');
    }
  } catch (e) {
    console.log(e);
  } finally {
    client.close();
  }
}

async function deregisterPlayer(socket, username, room, roomNum) {
  let client;
  try {
    client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
    const db = client.db('shogi');
    const collection = db.collection(room);
    const doc = await collection.findOne();
    if (!doc) {
      return;
    }
    if (!doc.started) {
      if (doc.player1 === username) {
        await collection.updateOne({}, {
          $set: {
            player1: null
          }
        });
        io.emit('deregistered', roomNum, 1);
      }
      if (doc.player2 === username) {
        await collection.updateOne({}, {
          $set: {
            player2: null
          }
        });
        io.emit('deregistered', roomNum, 2);
      }
    } else {
      if (!doc.waiting) {
        if (doc.player1 === username) {
          await collection.updateOne({}, {
            $set: {
              waiting: username
            }
          });
          socket.to(room).emit('wait', 1);
          socket.to(room).emit('really', 1);
        }
        if (doc.player2 === username) {
          await collection.updateOne({}, {
            $set: {
              waiting: username
            }
          });
          socket.to(room).emit('wait', 2);
          socket.to(room).emit('really', 2);
        }
      } else {
        if (doc.player1 === username && doc.player2 === doc.waiting) {
          await collection.deleteOne();
          socket.to(room).emit('wait', 1);
          io.emit('deregistered', roomNum, 1);
          io.emit('deregistered', roomNum, 2);
        }
        if (doc.player2 === username && doc.player1 === doc.waiting) {
          await collection.deleteOne();
          socket.to(room).emit('wait', 2);
          io.emit('deregistered', roomNum, 1);
          io.emit('deregistered', roomNum, 2);
        }
      }
    }
  } catch (e) {
    console.log(e);
  } finally {
    client.close();
  }
}

async function deregisterWaiting(username, room) {
  let client;
  try {
    client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
    const db = client.db('shogi');
    const collection = db.collection(room);
    const doc = await collection.findOne();
    if (doc.waiting === username) {
      await collection.updateOne({}, {
        $set: {
          waiting: null
        }
      });
    }
  } catch (e) {
    console.log(e);
  } finally {
    client.close();
  }
}

async function calculateRating(winner, room, roomNum) {
  let client;
  try {
    client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
    const db = client.db('shogi');
    const doc = await db.collection(room).findOne();
    const player1 = await db.collection('users').findOne({name: doc.player1});
    const player2 = await db.collection('users').findOne({name: doc.player2});
    const oldRating1 = player1.rating;
    const oldRating2 = player2.rating;
    let change;
    if (winner === 1) {
      change = 16 + (oldRating2 - oldRating1) * 0.04;
    } else {
      change = 16 + (oldRating1 - oldRating2) * 0.04;
    }
    if (change < 1) {
      change = 1;
    }
    if (change > 31) {
      change = 31;
    }
    let newRating1;
    let newRating2;
    if (winner === 1) {
      newRating1 = Math.floor((oldRating1 + change) * 100) / 100;
      newRating2 = Math.ceil((oldRating2 - change) * 100) / 100;
    } else {
      newRating1 = Math.ceil((oldRating1 - change) * 100) / 100;
      newRating2 = Math.floor((oldRating2 + change) * 100) / 100;
    }
    console.log('change:'+change);
    console.log('oldRating1:'+oldRating1+',newRating1:'+newRating1);
    console.log('oldRating2:'+oldRating2+',newRating2:'+newRating2);
    await db.collection('users').updateOne({name: doc.player1}, {
      $set: {
        rating: newRating1
      }
    });
    await db.collection('users').updateOne({name: doc.player2}, {
      $set: {
        rating: newRating2
      }
    });
  } catch (e) {
    console.log(e);
  } finally {
    client.close();
  }
  resetDocument(room, roomNum);
}

async function resetDocument(room, roomNum) {
  let client;
  try {
    client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
    const db = client.db('shogi');
    const collection = db.collection(room);
    await collection.deleteOne();
    io.emit('deregistered', roomNum, 1);
    io.emit('deregistered', roomNum, 2);
  } catch (e) {
    console.log(e);
  } finally {
    client.close();
  }
}

debug();

async function debug() {
  let client;
  try {
    client = await MongoClient.connect(mongoUrl, {useNewUrlParser: true});
    const db = client.db('shogi');
    for (let i = 1; i < 6; i++) {
      const room = 'room' + i;
      const collection = db.collection(room);
      await collection.deleteOne();
    }
    // while (true) {
    //   user = await db.collection('users').findOne();
    //   if (!user) {
    //     break;
    //   }
    //   await db.collection('users').deleteOne();
    // }
  } catch (e) {
    console.log(e);
  } finally {
    client.close();
  }
}

server.listen(PORT, () => {
  console.log('server listening. Port:' + PORT);
});

// cd Desktop/NewProgramming/03_MyShogi/node
// http://localhost:7000/
