(() => {

  'use strict';
  // 色の描画
  const color = document.getElementById('color');
  const colorCtx = color.getContext('2d');
  // フレームの描画
  const frame = document.getElementById('frame');
  const frameCtx = frame.getContext('2d');
  // 駒、テキストの描画
  const active = document.getElementById('active');
  const activeCtx = active.getContext('2d');
  // 成り選択の描画
  const choice = document.getElementById('choice');
  const choiceCtx = choice.getContext('2d');

  const prev = document.getElementById('prev');  // 仮
  const next = document.getElementById('next');  // 仮
  const information = document.getElementById('information');  // 仮

  const socket = io.connect();

  const WIDTH = 50;  // マスの幅
  const HEIGHT = 50;  // マスの高さ
  const X0 = WIDTH / 2;  // 盤の左端
  const Y0 = HEIGHT * 3 / 2;  // 盤の上端
  const X1 = X0 + WIDTH * 9;  // 盤の右端
  const Y1 = Y0 + HEIGHT * 9;  // 盤の下端

  const P = 144;
  const Q = 117;
  const R = 81;
  const radP = P / 180 * Math.PI;
  const radQ = Q / 180 * Math.PI;
  const radR = R / 180 * Math.PI;

  const PLAYER1 = 1;
  const PLAYER2 = 2;

  let player;
  let black;
  let white;
  let turn;

  let timerID;
  let timeB;
  let timeW;
  let winner;

  let timeoutID;
  let waitingTime = 0;

  let selectingF;  // 選択中の筋
  let selectingR;  // 選択中の段
  let selectingPiece;  // 選択中の駒
  let selectingPieceInHand;  // 選択中の持ち駒

  let selectingMovements = [];  // 選択中の駒の移動範囲
  for (let i = 1; i <= 9; i++) {
    selectingMovements[i] = [];
  }

  let isPending = false;  // 成り選択の保留中か
  let pendingF;  // 保留中の筋
  let pendingR;  // 保留中の段

  let latestF;  // 最新マスの筋
  let latestR;  // 最新マスの段

  let currentData = createData();

  function createData() {
    const results = [
      [0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0],  // 先手の駒台
      [0, 22,  0, 21,  0,  0,  0,  1,  0,  2,  0],
      [0, 23, 26, 21,  0,  0,  0,  1,  7,  3,  0],
      [0, 24,  0, 21,  0,  0,  0,  1,  0,  4,  0],
      [0, 25,  0, 21,  0,  0,  0,  1,  0,  5,  0],
      [0, 28,  0, 21,  0,  0,  0,  1,  0,  8,  0],
      [0, 25,  0, 21,  0,  0,  0,  1,  0,  5,  0],
      [0, 24,  0, 21,  0,  0,  0,  1,  0,  4,  0],
      [0, 23, 27, 21,  0,  0,  0,  1,  6,  3,  0],
      [0, 22,  0, 21,  0,  0,  0,  1,  0,  2,  0],
      [0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0]  // 後手の駒台
    ];
    return results;
  }

  let positions = [];
  let currentPosition = 0;

  drawFrame();

  socket.emit('join_room');

  socket.on('set_player', num => {
    player = num;
    drawClockB('05', '00');
    drawClockW('05', '00');
    information.textContent = '対局相手を待っています';

    socket.on('unset_player', num => {
      if (player === num) {
        socket.disconnect();
        information.textContent = '接続が切れました';
      }
    });

    socket.on('ready', () => {
      socket.emit('ready');
    });

    socket.on('start_game', () => {
      setTurn();
      socket.emit('set_up', {
        turn: turn
      });
    });

    socket.on('really', num => {
      if (player === num) {
        socket.emit('exists', num);
      }
    });

    socket.on('check_started', () => {
      timeoutID = setTimeout(checkStarted, 1000);
    });
  });

  socket.on('set_up', data => {
    setUp(data);
    drawPieceAll(currentData);
    updateGame();
  });

  socket.on('respond_data', data => {
    positions = data.positions;
    setUp(data);
    drawPieceAll(currentData);
    updateGame();
  });

  prev.addEventListener('click', function() {
    movePositionToPrev();
  });
  next.addEventListener('click', function() {
    movePositionToNext();
  });

  socket.on('end_of_the_game', data => {
    winner = data.winner;
    if (player) {
      if (player === winner) {
        information.textContent = 'あなたの勝ちです';
      } else {
        information.textContent = 'あなたの負けです';
      }
    } else {
      if (black === winner) {
        information.textContent = '先手の勝ちです';
      } else {
        information.textContent = '後手の勝ちです';
      }
    }
    socket.disconnect();
  });

  function setTurn() {
    const arr = [PLAYER1, PLAYER2];
    const n = Math.floor(Math.random() * arr.length);
    turn = arr[n];
  }

  function setUp(data) {
    black = data.black || data.turn;
    white = black === PLAYER1 ? PLAYER2 : PLAYER1;
    turn = data.turn;
    timeB = data.timeB || 300;
    timeW = data.timeW || 300;
    if (player) {
      setUpForPlayer();
      drawResignation();
      updateInformation();  // 仮
      // timerID = setTimeout(updateTime, 1000);
    } else {
      information.textContent = 'あなたは観戦者です';
    }

    socket.on('request_data', socketID => {
      if (player) {
        socket.emit('respond_data', socketID, {
          black: black,
          turn: turn,
          timeB: timeB,
          timeW: timeW,
          latestF: latestF,
          latestR: latestR,
          positions: positions
        });
      }
    });

    socket.on('update_time_b', data => {
      timeB = data.timeB;
      updateClock(timeB, drawClockB);
    });

    socket.on('update_time_w', data => {
      timeW = data.timeW;
      updateClock(timeW, drawClockW);
    });

    socket.on('update_game', data => {
      // getAudioBuffer('se.mp3', playSound);
      if (turn === black) {
        timeB += 5;
        turn = white;
      } else {
        timeW += 5;
        turn = black;
      }
      positions.push(data);
      updateGame();
    });

    socket.on('wait', num => {
      if (player === num) {
        return;
      }
      if (num === 1) {
        // clock1.className = 'clock disconnected';
      } else {
        // clock2.className = 'clock disconnected';
      }
      if (player) {
        clearTimeout(timeoutID);
        waitingTime = 0;
        timeoutID = setTimeout(checkWaitingTime, 1000);
      }
      // if (clock1.className === clock2.className) {
      //   socket.disconnect();
      //   information.textContent = '対局者の接続が切れました';
      // }
    });

    socket.on('exists', num => {
      if (num === 1) {
        // clock1.className = 'clock';
      } else {
        // clock2.className = 'clock';
      }
      if (player) {
        clearTimeout(timeoutID);
      }
    });
  }

  function setUpForPlayer() {
    if (player === white) {
      rotateCtx(colorCtx);
      rotateCtx(frameCtx);
      rotateCtx(activeCtx);
      rotateCtx(choiceCtx);
    }
  }

  function updateInformation() {
    if (player === turn) {
      information.textContent = 'あなたの手番です';
    } else {
      information.textContent = '相手の手番です';
    }
  }

  function updateTime() {
    if (player === turn) {
      return;
    }
    if (player === black) {
      updateTimeW();
    } else {
      updateTimeB();
    }
    timerID = setTimeout(updateTime, 1000);
  }

  function updateTimeB() {
    timeB--;
    socket.emit('update_time_b', {
      timeB: timeB
    });
    checkTimeout(timeB);
  }

  function updateTimeW() {
    timeW--;
    socket.emit('update_time_w', {
      timeW: timeW
    });
    checkTimeout(timeW);
  }

  function checkTimeout(time) {
    if (time === 0) {
      winner = timeB === 0 ? white : black;
      socket.emit('end_of_the_game', {
        winner: winner
      });
    }
  }

  function updateClock(time, callback) {
    let m = Math.floor(time / 60);
    let s = time % 60;
    m = ('0' + m).slice(-2);
    s = ('0' + s).slice(-2);
    callback(m, s);
  }

  function checkWaitingTime() {
    waitingTime++;
    if (waitingTime === 10) {
      winner = player === PLAYER1 ? PLAYER1 : PLAYER2;
      socket.emit('end_of_the_game', {
        winner: winner
      });
    }
    timeoutID = setTimeout(checkWaitingTime, 1000);
  }

  function checkStarted() {
    if (black) {
      return;
    }
    waitingTime++;
    console.log(waitingTime)
    if (waitingTime === 10) {
      socket.emit('abort');
    }
    timeoutID = setTimeout(checkStarted, 1000);
  }

  function drawFrame() {
    for (let i = 0; i < 10; i++) {
      drawLine(X0, Y0 + HEIGHT * i, X1, Y0 + HEIGHT * i);
      drawLine(X0 + WIDTH * i, Y0, X0 + WIDTH * i, Y1);
    }
    drawLine(0, HEIGHT, WIDTH * 10, HEIGHT);
    drawLine(0, HEIGHT * 11, WIDTH * 10, HEIGHT * 11);

    drawLine(WIDTH / 2, 0, WIDTH / 2, HEIGHT);
    drawLine(WIDTH * 5 / 2, 0, WIDTH * 5 / 2, HEIGHT);
    drawLine(WIDTH / 2, HEIGHT / 2, WIDTH * 5 / 2, HEIGHT / 2);

    drawLine(WIDTH * 15 / 2, HEIGHT * 11, WIDTH * 15 / 2, HEIGHT * 12);
    drawLine(WIDTH * 19 / 2, HEIGHT * 11, WIDTH * 19 / 2, HEIGHT * 12);
    drawLine(WIDTH * 15 / 2, HEIGHT * 23 / 2, WIDTH * 19 / 2, HEIGHT * 23 / 2);
  }

  function drawLine(x0, y0, x1, y1) {
    frameCtx.strokeStyle = '#000';
    frameCtx.lineWidth = 0.5;

    frameCtx.beginPath();
    frameCtx.moveTo(x0, y0);
    frameCtx.lineTo(x1, y1);
    frameCtx.stroke();
  }

  function drawClockB(m, s) {
    let x, y;
    if (player === white) {
      x = WIDTH / 2;
      y = 0;
    } else {
      x = WIDTH * 15 / 2;
      y = HEIGHT * 11;
    }
    activeCtx.fillStyle = '#aaa';
    activeCtx.font = '16px sans-serif';
    activeCtx.textAlign = 'center';

    if (player === white) {
      activeCtx.save();
      rotateCtx(activeCtx);
    }
    activeCtx.clearRect(x, y, WIDTH * 2, HEIGHT / 2);
    activeCtx.fillText(`${m}:${s}`, x + WIDTH, y + HEIGHT / 2 - 7);

    if (player === white) {
      activeCtx.restore();
    }
  }

  function drawClockW(m, s) {
    let x, y;
    if (player === white) {
      x = WIDTH * 15 / 2;
      y = HEIGHT * 11;
    } else {
      x = WIDTH / 2;
      y = 0;
    }
    activeCtx.fillStyle = '#aaa';
    activeCtx.font = '16px sans-serif';
    activeCtx.textAlign = 'center';

    if (player === white) {
      activeCtx.save();
      rotateCtx(activeCtx);
    }
    activeCtx.clearRect(x, y, WIDTH * 2, HEIGHT / 2);
    activeCtx.fillText(`${m}:${s}`, x + WIDTH, y + HEIGHT / 2 - 7);

    if (player === white) {
      activeCtx.restore();
    }
  }

  function rotateCtx(ctx) {
    ctx.translate(WIDTH * 10, HEIGHT * 12);
    ctx.rotate(Math.PI);
  }

  function drawResignation() {
    const x = WIDTH * 15 / 2;
    const y = HEIGHT * 23 / 2;

    activeCtx.fillStyle = '#aaa';
    activeCtx.font = '16px sans-serif';
    activeCtx.textAlign = 'center';

    if (player === white) {
      activeCtx.save();
      rotateCtx(activeCtx);
    }
    // activeCtx.clearRect(x, y, WIDTH * 2, HEIGHT / 2);
    activeCtx.fillText('投了', x + WIDTH, y + HEIGHT / 2 - 7);

    if (player === white) {
      activeCtx.restore();
    }
  }

  function drawPieceAll(data) {
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        if (data[i][j]) {
          drawPiece(i, j, data[i][j]);
        }
      }
    }
  }

  function clearPiece(file, rank) {
    const x = X0 + WIDTH * (9 - file);
    const y = Y0 + HEIGHT * (rank - 1);

    activeCtx.clearRect(x, y, WIDTH, HEIGHT);
  }

  function drawPiece(file, rank, piece) {
    const h = getH(piece);  // 駒の高さ
    let x0, y0;
    if (piece < 20) {
      x0 = X0 + WIDTH * (9 - file) + WIDTH / 2;
      y0 = Y0 + HEIGHT * (rank - 1) + (HEIGHT - h) / 2;
    } else {
      x0 = X0 + WIDTH * (file - 1) + WIDTH / 2;
      y0 = Y0 + HEIGHT * (9 - rank) + (HEIGHT - h) / 2;
    }
    drawShape(piece, x0, y0, activeCtx);
    drawCharacter(piece, x0, y0 - (HEIGHT - h) / 2 + 35, activeCtx);
  }

  function drawShape(piece, x0, y0, ctx) {
    const h = getH(piece);  // 駒の高さ
    const u = getU(piece);  // 駒の底辺と高さの比率
    const a = h / u;  // 駒の底辺
    const c = a * (u * Math.cos(radR) - Math.sin(radR) / 2) / Math.cos(radP / 2 + radR);

    const x1 = x0 + c * Math.sin(radP / 2);
    const y1 = y0 + c * Math.cos(radP / 2);
    const x2 = x0 + a / 2;
    const y2 = y0 + u * a;
    const x3 = x0 - a / 2;
    const y3 = y0 + u * a;
    const x4 = x0 - c * Math.sin(radP / 2);
    const y4 = y0 + c * Math.cos(radP / 2);

    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;

    if (piece > 20) {
      ctx.save();
      rotateCtx(ctx);
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.stroke();

    if (piece > 20) {
      ctx.restore();
    }
  }

  function drawCharacter(piece, x, y, ctx) {
    const character = getCharacter(piece);

    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.font = '22px serif';
    ctx.textAlign = 'center';

    if (piece > 20) {
      ctx.save();
      rotateCtx(ctx);
    }
    ctx.strokeText(character, x, y);

    if (piece > 20) {
      ctx.restore();
    }
  }

  function getH(piece) {
    switch (piece) {
      case 1:
      case 11:
      case 21:
      case 31:
        return 38;

      case 2:
      case 3:
      case 12:
      case 13:
      case 22:
      case 23:
      case 32:
      case 33:
        return 40;

      case 4:
      case 5:
      case 14:
      case 24:
      case 25:
      case 34:
        return 41;

      case 6:
      case 7:
      case 16:
      case 17:
      case 26:
      case 27:
      case 36:
      case 37:
        return 43;

      case 8:
      case 28:
        return 44;
    }
  }

  function getU(piece) {
    switch (piece) {
      case 1:
      case 11:
      case 21:
      case 31:
        return 1.2;

      case 2:
      case 12:
      case 22:
      case 32:
        return 1.18;

      case 3:
      case 6:
      case 7:
      case 13:
      case 16:
      case 17:
      case 23:
      case 26:
      case 27:
      case 33:
      case 36:
      case 37:
        return 1.12;

      case 4:
      case 5:
      case 8:
      case 14:
      case 24:
      case 25:
      case 28:
      case 34:
        return 1.1;
    }
  }

  function getCharacter(piece) {
    switch (piece) {
      case 1:
      case 21:
        return '歩';

      case 2:
      case 22:
        return '香';

      case 3:
      case 23:
        return '桂';

      case 4:
      case 24:
        return '銀';

      case 5:
      case 25:
        return '金';

      case 6:
      case 26:
        return '角';

      case 7:
      case 27:
        return '飛';

      case 8:
      case 28:
        return '玉';

      case 11:
      case 31:
        return 'と';

      case 12:
      case 32:
        return '杏';

      case 13:
      case 33:
        return '圭';

      case 14:
      case 34:
        return '全';

      case 16:
      case 36:
        return '馬';

      case 17:
      case 37:
        return '龍';
    }
  }

  function clearStand(x, y) {
    const w = WIDTH * 7;
    const h = HEIGHT;

    activeCtx.clearRect(x, y, w, h);
  }

  function drawPieceInHand(standData, sum) {
    let count = 0;
    for (let i = 7; i >= 1; i--) {
      if (standData[i]) {
        const h = getH(i + sum);  // 駒の高さ
        const x0 = WIDTH * count + WIDTH / 2;
        const y0 = HEIGHT * 11 + (HEIGHT - h) / 2;

        drawShape(i + sum, x0, y0, activeCtx);
        drawCharacter(i + sum, x0, y0 - (HEIGHT - h) / 2 + 35, activeCtx);
        drawNumber(i + sum, count, standData[i]);
        count++;
      }
    }
  }

  function drawNumber(piece, count, num) {
    if (num === 1) {
      return;
    }
    let x, y;
    if (player === white) {
      if (piece < 20) {
        x = WIDTH * (9 - count) + 40;
        y = 40;
      } else {
        x = WIDTH * count + 40;
        y = HEIGHT * 11 + 40;
      }
    } else {
      if (piece < 20) {
        x = WIDTH * count + 40;
        y = HEIGHT * 11 + 40;
      } else {
        x = WIDTH * (9 - count) + 40;
        y = 40;
      }
    }
    if (player === white) {
      activeCtx.save();
      rotateCtx(activeCtx);
    }
    activeCtx.fillStyle = '#aaa';
    activeCtx.beginPath();
    activeCtx.arc(x, y, 10, 0, 2 * Math.PI);
    activeCtx.fill();

    activeCtx.fillStyle = '#fff';
    activeCtx.font = '12px sans-serif';
    activeCtx.textAlign = 'center';
    activeCtx.fillText(num, x, y + 4);

    if (player === white) {
      activeCtx.restore();
    }
  }

  function initMovements() {
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        if (selectingMovements[i][j]) {
          selectingMovements[i][j] = false;
        }
      }
    }
  }

  function clearBoard(ctx) {
    const x = X0;
    const y = Y0;

    ctx.clearRect(x, y, WIDTH * 9, HEIGHT * 9);
  }

  function drawColor(file, rank, color) {
    const x = X0 + WIDTH * (9 - file);
    const y = Y0 + HEIGHT * (rank - 1);

    colorCtx.fillStyle = color;
    colorCtx.fillRect(x, y, WIDTH, HEIGHT);
  }

  function drawMovements() {
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        if (selectingMovements[i][j]) {
          drawColor(i, j, 'lightgreen');
        }
      }
    }
  }

  function initSelecting() {
    selectingF = null;
    selectingR = null;
    selectingPiece = null;
    selectingPieceInHand = null;
  }

  function getTargetPieceInHand(standData, order, sum) {
    let count = 0;
    for (let i = 7; i >= 1; i--) {
      if (standData[i]) {
        if (count === order) {
          return i + sum;
        }
        count++;
      }
    }
  }

  function isPlayersPiece(piece) {
    if (player === black && piece < 20 || player === white && piece > 20) {
      return true;
    }
  }

  function clickMovements(targetF, targetR) {
    // 移動範囲を消去
    initMovements();
    clearBoard(colorCtx);
    // 盤上の駒が移動するとき
    if (selectingPiece) {
      checkPromotion(targetF, targetR, selectingR, selectingPiece);
      if (isPending) {
        return;
      }
    }
    // データを送信
    socket.emit('update_game', {
      latestF: targetF,
      latestR: targetR,
      sourceF: selectingF,
      sourceR: selectingR,
      movingPiece: selectingPiece,
      movingPieceInHand: selectingPieceInHand,
    });
    // 選択を解除
    initSelecting();
  }

  function checkPromotion(targetF, targetR, selectingR, selectingPiece) {
    if (targetR <= 3 || selectingR <= 3) {
      switch (selectingPiece) {
        case 1:
        case 2:
          if (targetR === 1) {
            setPromotion();
          } else {
            drawChoice(targetF, targetR, selectingPiece);
          }
          return;

        case 3:
          if (targetR <= 2) {
            setPromotion();
          } else {
            drawChoice(targetF, targetR, selectingPiece);
          }
          return;

        case 4:
        case 6:
        case 7:
          drawChoice(targetF, targetR, selectingPiece);
          return;
      }
    }
    if (targetR >= 7 || selectingR >= 7) {
      switch (selectingPiece) {
        case 21:
        case 22:
          if (targetR === 9) {
            setPromotion();
          } else {
            drawChoice(targetF, targetR, selectingPiece);
          }
          return;

        case 23:
          if (targetR >= 8) {
            setPromotion();
          } else {
            drawChoice(targetF, targetR, selectingPiece);
          }
          return;

        case 24:
        case 26:
        case 27:
          drawChoice(targetF, targetR, selectingPiece);
          return;
      }
    }
  }

  function setPromotion() {
    selectingPiece += 10;
  }

  function drawChoice(file, rank, piece) {
    const h = getH(piece);  // 駒の高さ
    let x0, y0;
    if (piece < 20) {
      x0 = X0 + WIDTH * (9 - file);
      y0 = Y0 + HEIGHT * (rank - 1) + (HEIGHT - h) / 2;
    } else {
      x0 = X0 + WIDTH * (file - 1);
      y0 = Y0 + HEIGHT * (9 - rank) + (HEIGHT - h) / 2;
    }
    choiceCtx.fillStyle = '#fff';
    choiceCtx.strokeStyle = '#000';
    choiceCtx.lineWidth = 0.5;

    if (piece > 20) {
      choiceCtx.save();
      rotateCtx(choiceCtx);
    }
    choiceCtx.clearRect(0, 0, WIDTH * 10, HEIGHT * 12);
    choiceCtx.fillRect(x0 - X0, y0 - (HEIGHT - h) / 2, WIDTH * 2, HEIGHT);
    choiceCtx.strokeRect(x0 - X0, y0 - (HEIGHT - h) / 2, WIDTH * 2, HEIGHT);

    if (piece > 20) {
      choiceCtx.restore();
    }
    drawShape(piece, x0, y0, choiceCtx);
    drawCharacter(piece, x0, y0 - (HEIGHT - h) / 2 + 35, choiceCtx);
    drawShape(piece + 10, x0 + WIDTH, y0, choiceCtx);
    drawCharacter(piece + 10, x0 + WIDTH, y0 - (HEIGHT - h) / 2 + 35, choiceCtx);

    isPending = true;
    pendingF = file;
    pendingR = rank;
    choice.classList.remove('hidden');
  }

  function updateGame() {
    clearTimeout(timerID);
    updateClock(timeB, drawClockB);
    updateClock(timeW, drawClockW);
    // 局面を更新
    // movePositionToNext();
    for (let i = currentPosition; i < positions.length; i++) {
      movePositionToNext();
    }
    if (!player) {
      return;
    }
    updateInformation();
    timerID = setTimeout(updateTime, 1000);

    if (!isChecked(currentData, player === black ? 8 : 28)) {
      return;
    }
    if (!isCheckmated(currentData, player === black ? 8 : 28)) {
      console.log('王手です');
    } else {
      console.log('詰みです');
      winner = player === black ? white : black;
      socket.emit('end_of_the_game', {
        winner: winner
      });
    }
  }

  function movePositionToPrev() {
    if (currentPosition === 0) {
      return;
    }
    // 最新マスをクリア
    clearBoard(colorCtx);

    currentData = createData();
    clearBoard(activeCtx);
    clearStand(WIDTH * 3, 0);
    clearStand(0, HEIGHT * 11);
    drawPieceAll(currentData);

    const prevPosition = currentPosition - 1;
    for (let i = 0; i < prevPosition; i++) {
      // 盤上の駒が移動するとき
      if (positions[i].movingPiece) {
        movePiece(positions[i]);
      }
      // 駒台の駒が移動するとき
      if (positions[i].movingPieceInHand) {
        dropPieceInHand(positions[i]);
      }
    }
    if (prevPosition >= 1) {
      // 最新マスを保持
      latestF = positions[prevPosition - 1].latestF;
      latestR = positions[prevPosition - 1].latestR;
      // 最新マスを描画
      drawColor(latestF, latestR, 'yellow');
    }
    currentPosition = prevPosition;
  }

  function movePositionToNext() {
    if (currentPosition === positions.length) {
      return;
    }
    // 最新マスをクリア
    if (latestF && latestR) {
      clearBoard(colorCtx);
    }
    // 盤上の駒が移動するとき
    if (positions[currentPosition].movingPiece) {
      movePiece(positions[currentPosition]);
    }
    // 駒台の駒が移動するとき
    if (positions[currentPosition].movingPieceInHand) {
      dropPieceInHand(positions[currentPosition]);
    }
    // 最新マスを保持
    latestF = positions[currentPosition].latestF;
    latestR = positions[currentPosition].latestR;
    // 最新マスを描画
    drawColor(latestF, latestR, 'yellow');

    currentPosition++;
  }

  function movePiece(data) {
    // 移動先に駒があれば
    if (currentData[data.latestF][data.latestR]) {
      clearPiece(data.latestF, data.latestR);
      // 駒台を更新
      if (data.movingPiece < 20) {
        setCapturedPiece(currentData[0], currentData[data.latestF][data.latestR]);
        clearStand(0, HEIGHT * 11);
        drawPieceInHand(currentData[0], 0);
      } else {
        setCapturedPiece(currentData[10], currentData[data.latestF][data.latestR]);
        clearStand(WIDTH * 3, 0);
        drawPieceInHand(currentData[10], 20);
      }
    }
    // 移動元の駒を消去
    currentData[data.sourceF][data.sourceR] = 0;
    clearPiece(data.sourceF, data.sourceR);
    // 移動先に駒を描画
    currentData[data.latestF][data.latestR] = data.movingPiece;
    drawPiece(data.latestF, data.latestR, data.movingPiece);
  }

  function dropPieceInHand(data) {
    // 移動元の駒を消去、駒台を更新
    if (data.movingPieceInHand < 20) {
      currentData[0][data.movingPieceInHand]--;
      clearStand(0, HEIGHT * 11);
      drawPieceInHand(currentData[0], 0);
    } else {
      currentData[10][data.movingPieceInHand - 20]--;
      clearStand(WIDTH * 3, 0);
      drawPieceInHand(currentData[10], 20);
    }
    // 移動先に駒を描画
    currentData[data.latestF][data.latestR] = data.movingPieceInHand;
    drawPiece(data.latestF, data.latestR, data.movingPieceInHand);
  }

  function setCapturedPiece(standData, piece) {
    switch (piece) {
      case 1:
      case 11:
      case 21:
      case 31:
        standData[1]++;
        return;

      case 2:
      case 12:
      case 22:
      case 32:
        standData[2]++;
        return;

      case 3:
      case 13:
      case 23:
      case 33:
        standData[3]++;
        return;

      case 4:
      case 14:
      case 24:
      case 34:
        standData[4]++;
        return;

      case 5:
      case 25:
        standData[5]++;
        return;

      case 6:
      case 16:
      case 26:
      case 36:
        standData[6]++;
        return;

      case 7:
      case 17:
      case 27:
      case 37:
        standData[7]++;
        return;
    }
  }

  active.addEventListener('click', e => {
    if (winner || player !== turn) {
      return;
    }
    // 盤内をクリックしたとき
    if (e.offsetX >= X0 && e.offsetX <= X1 && e.offsetY >= Y0 && e.offsetY <= Y1) {
      // フレームをクリックしたとき
      if ((e.offsetX + X0) % WIDTH === 0 || (e.offsetY + Y0) % HEIGHT === 0) {
        console.log('It is frame...');
        return;
      }
      // クリック先のマス、駒を取得
      let targetF, targetR;
      if (player === black) {
        targetF = Math.ceil(9 - (e.offsetX - X0) / WIDTH);
        targetR = Math.ceil((e.offsetY - Y0) / HEIGHT);
      } else {
        targetF = Math.ceil((e.offsetX - X0) / WIDTH);
        targetR = Math.ceil(9 - (e.offsetY - Y0) / HEIGHT);
      }
      const targetPiece = currentData[targetF][targetR];
      // 移動範囲ならば
      if (selectingMovements[targetF][targetR]) {
        clickMovements(targetF, targetR);
      } else {
        // 移動範囲を消去
        initMovements();
        clearBoard(colorCtx);
        // 最新マスを描画
        if (latestF && latestR) {
          drawColor(latestF, latestR, 'yellow');
        }
        // クリック先に駒があれば
        if (targetPiece && isPlayersPiece(targetPiece)) {
          setMovementsOfPiece(targetF, targetR, currentData, selectingMovements);
          setMovementsToLegal(targetF, targetR, currentData, targetPiece, selectingMovements);
          // 移動範囲を描画
          drawMovements();
          // 選択を保持
          selectingF = targetF;
          selectingR = targetR;
          selectingPiece = targetPiece;
          selectingPieceInHand = null;
          // クリック先に駒が無ければ
        } else {
          // 選択を解除
          initSelecting();
        }
      }
      // 盤外をクリックしたとき
    } else {
      // フレームをクリックしたとき
      if (e.offsetX % WIDTH === 0 || e.offsetY + Y0 % HEIGHT === 0) {
        console.log('It is frame...');
        return;
      }
      // クリック先の持ち駒を取得
      let targetPieceInHand;
      if (e.offsetY >= HEIGHT * 11 && e.offsetY <= HEIGHT * 12) {
        const order = Math.floor(e.offsetX / WIDTH);
        if (player === black) {
          targetPieceInHand = getTargetPieceInHand(currentData[0], order, 0);
        } else {
          targetPieceInHand = getTargetPieceInHand(currentData[10], order, 20);
        }
      }
      // 移動範囲を消去
      initMovements();
      clearBoard(colorCtx);
      // 最新マスを描画
      if (latestF && latestR) {
        drawColor(latestF, latestR, 'yellow');
      }
      // クリック先に持ち駒があれば
      if (targetPieceInHand && isPlayersPiece(targetPieceInHand)) {
        setMovementsOfPieceInHand(currentData, targetPieceInHand, selectingMovements);
        setMovementsToLegal(0, 0, currentData, targetPieceInHand, selectingMovements);
        // 移動範囲を描画
        drawMovements();
        // 選択を保持
        selectingF = null;
        selectingR = null;
        selectingPiece = null;
        selectingPieceInHand = targetPieceInHand;
        // クリック先に持ち駒が無ければ
      } else {
        // 選択を解除
        initSelecting();
      }
    }
  });

  choice.addEventListener('click', e => {
    // if (winner || player !== turn) {
    //   return;
    // }
    // 成り選択の座標を取得
    let x0, y0;
    if (selectingPiece < 20) {
      x0 = WIDTH * (9 - pendingF);
      y0 = Y0 + HEIGHT * (pendingR - 1);
    } else {
      x0 = WIDTH * (pendingF - 1);
      y0 = Y0 + HEIGHT * (9 - pendingR);
    }
    const x1 = x0 + WIDTH * 2;
    const y1 = y0 + HEIGHT;
    // 選択範囲をクリックしたとき
    if (e.offsetX >= x0 && e.offsetX <= x1 && e.offsetY >= y0 && e.offsetY <= y1) {
      // フレームをクリックしたとき
      if (e.offsetX % WIDTH === 0 || (e.offsetY + Y0) % HEIGHT === 0) {
        console.log('It is frame...');
        return;
      }
      if (isPending) {
        // 成り選択を反映
        selectingPiece = e.offsetX < x0 + WIDTH ? selectingPiece : selectingPiece + 10;
        // データを送信
        socket.emit('update_game', {
          latestF: pendingF,
          latestR: pendingR,
          sourceF: selectingF,
          sourceR: selectingR,
          movingPiece: selectingPiece,
          movingPieceInHand: selectingPieceInHand
        });
      }
    }
    // 選択を解除
    initSelecting();
    // 成り選択を解除、非表示
    isPending = false;
    pendingF = null;
    pendingR = null;
    choice.classList.add('hidden');
  });

  function setMovementsOfPiece(file, rank, data, movements) {
    switch (data[file][rank]) {
      case 1:
      case 21:
        setOne(file, rank, data, movements, 0, 1);
        return;

      case 2:
      case 22:
        setLine(file, rank, data, movements, 0, 1);
        return;

      case 3:
      case 23:
        setOne(file, rank, data, movements, -1, 2);
        setOne(file, rank, data, movements, 1, 2);
        return;

      case 4:
      case 24:
        setOne(file, rank, data, movements, -1, 1);
        setOne(file, rank, data, movements, 0, 1);
        setOne(file, rank, data, movements, 1, 1);
        setOne(file, rank, data, movements, -1, -1);
        setOne(file, rank, data, movements, 1, -1);
        return;

      case 5:
      case 11:
      case 12:
      case 13:
      case 14:
      case 25:
      case 31:
      case 32:
      case 33:
      case 34:
        setOne(file, rank, data, movements, -1, 1);
        setOne(file, rank, data, movements, 0, 1);
        setOne(file, rank, data, movements, 1, 1);
        setOne(file, rank, data, movements, -1, 0);
        setOne(file, rank, data, movements, 1, 0);
        setOne(file, rank, data, movements, 0, -1);
        return;

      case 6:
      case 26:
        setLine(file, rank, data, movements, -1, 1);
        setLine(file, rank, data, movements, 1, 1);
        setLine(file, rank, data, movements, -1, -1);
        setLine(file, rank, data, movements, 1, -1);
        return;

      case 7:
      case 27:
        setLine(file, rank, data, movements, 0, 1);
        setLine(file, rank, data, movements, -1, 0);
        setLine(file, rank, data, movements, 1, 0);
        setLine(file, rank, data, movements, 0, -1);
        return;

      case 8:
      case 28:
        setOne(file, rank, data, movements, -1, 1);
        setOne(file, rank, data, movements, 0, 1);
        setOne(file, rank, data, movements, 1, 1);
        setOne(file, rank, data, movements, -1, 0);
        setOne(file, rank, data, movements, 1, 0);
        setOne(file, rank, data, movements, -1, -1);
        setOne(file, rank, data, movements, 0, -1);
        setOne(file, rank, data, movements, 1, -1);
        return;

      case 16:
      case 36:
        setLine(file, rank, data, movements, -1, 1);
        setOne(file, rank, data, movements, 0, 1);
        setLine(file, rank, data, movements, 1, 1);
        setOne(file, rank, data, movements, -1, 0);
        setOne(file, rank, data, movements, 1, 0);
        setLine(file, rank, data, movements, -1, -1);
        setOne(file, rank, data, movements, 0, -1);
        setLine(file, rank, data, movements, 1, -1);
        return;

      case 17:
      case 37:
        setOne(file, rank, data, movements, -1, 1);
        setLine(file, rank, data, movements, 0, 1);
        setOne(file, rank, data, movements, 1, 1);
        setLine(file, rank, data, movements, -1, 0);
        setLine(file, rank, data, movements, 1, 0);
        setOne(file, rank, data, movements, -1, -1);
        setLine(file, rank, data, movements, 0, -1);
        setOne(file, rank, data, movements, 1, -1);
        return;
    }
  }

  function setOne(file, rank, data, movements, fileDiff, rankDiff) {
    const target = data[file][rank];
    const sign = target < 20 ? 1 : -1;
    file = file - (fileDiff * sign);
    rank = rank - (rankDiff * sign);
    if (file >= 1 && file <= 9 && rank >= 1 && rank <= 9) {
      if (data[file][rank]) {
        if (isFriendlyPiece(file, rank, data, target)) {
          return;
        }
      }
      movements[file][rank] = true;
    }
  }

  function setLine(file, rank, data, movements, fileDiff, rankDiff) {
    const target = data[file][rank];
    const sign = target < 20 ? 1 : -1;
    file = file - (fileDiff * sign);
    rank = rank - (rankDiff * sign);
    while (file >= 1 && file <= 9 && rank >= 1 && rank <= 9) {
      if (data[file][rank]) {
        if (isFriendlyPiece(file, rank, data, target)) {
          return;
        } else {
          movements[file][rank] = true;
          return;
        }
      }
      movements[file][rank] = true;
      file = file - (fileDiff * sign);
      rank = rank - (rankDiff * sign);
    }
  }

  function isFriendlyPiece(file, rank, data, piece) {
    const target = data[file][rank];
    if (target < 20 && piece < 20 || target > 20 && piece > 20) {
      return true;
    }
  }

  function setMovementsOfPieceInHand(data, piece, movements) {
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        if (!data[i][j]) {
          if (isLegal(i, j, data, piece)) {
            movements[i][j] = true;
          }
        }
      }
    }
  }

  function isLegal(file, rank, data, piece) {
    switch (piece) {
      case 1:
        if (rank >= 2) {
          if (!isTwoPawns(file, data, piece)) {
            if (!isDropPawnMate(file, rank, data, piece)) {
              return true;
            }
          }
        }
        return;

      case 2:
        if (rank >= 2) {
          return true;
        }
        return;

      case 3:
        if (rank >= 3) {
          return true;
        }
        return;

      case 21:
        if (rank <= 8) {
          if (!isTwoPawns(file, data, piece)) {
            if (!isDropPawnMate(file, rank, data, piece)) {
              return true;
            }
          }
        }
        return;

      case 22:
        if (rank <= 8) {
          return true;
        }
        return;

      case 23:
        if (rank <= 7) {
          return true;
        }
        return;

      default:
        return true;
    }
  }

  function isTwoPawns(file, data, piece) {
    for (let i = 1; i <= 9; i++) {
      if (data[file][i] === piece) {
        return true;
      }
    }
  }

  function isDropPawnMate(file, rank, data, piece) {
    const target = piece < 20 ? 28 : 8;
    const targetF = file;
    const targetR = piece < 20 ? rank - 1 : rank + 1;

    if (data[targetF][targetR] === target) {
      const tmpData = copyData(data);
      tmpData[file][rank] = piece;
      if (isCheckmated(tmpData, target)) {
        return true;
      }
    }
  }

  function setMovementsToLegal(file, rank, data, piece, movements) {
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        if (movements[i][j]) {
          const tmpData = copyData(data);
          tmpData[file][rank] = 0;
          tmpData[i][j] = piece;
          if (isChecked(tmpData, piece)) {
            movements[i][j] = false;
          }
        }
      }
    }
  }

  function copyData(data) {
    const results = [];
    for (let i = 0; i <= 10; i++) {
      results[i] = [];
      for (let j = 0; j <= 10; j++) {
        results[i][j] = data[i][j];
      }
    }
    return results;
  }

  function isChecked(data, piece) {
    const target = piece < 20 ? 8 : 28;
    const movements = createMovements();
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        if (data[i][j]) {
          if (!isFriendlyPiece(i, j, data, target)) {
            setMovementsOfPiece(i, j, data, movements);
          }
        }
      }
    }
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        if (movements[i][j]) {
          if (data[i][j] === target) {
            return true;
          }
        }
      }
    }
  }

  function createMovements() {
    const results = [];
    for (let i = 1; i <= 9; i++) {
      results[i] = [];
    }
    return results;
  }

  function isCheckmated(data, piece) {
    if (!canMovePiece(data, piece)) {
      if (!canDropPieceInHand(data, piece)) {
        return true;
      }
    }
  }

  function canMovePiece(data, piece) {
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        if (data[i][j]) {
          if (isFriendlyPiece(i, j, data, piece)) {
            const movements = createMovements();
            setMovementsOfPiece(i, j, data, movements);
            setMovementsToLegal(i, j, data, data[i][j], movements);
            if (movementsExists(movements)) {
              return true;
            }
          }
        }
      }
    }
  }

  function canDropPieceInHand(data, piece) {
    const standData = piece < 20 ? data[0] : data[10];
    const sum = piece < 20 ? 0 : 20;
    for (let i = 1; i <= 7; i++) {
      if (standData[i]) {
        const movements = createMovements();
        setMovementsOfPieceInHand(data, i + sum, movements);
        setMovementsToLegal(0, 0, data, i + sum, movements);
        if (movementsExists(movements)) {
          return true;
        }
      }
    }
  }

  function movementsExists(movements) {
    for (let i = 1; i <= 9; i++) {
      for (let j = 1; j <= 9; j++) {
        if (movements[i][j]) {
          return true;
        }
      }
    }
  }

})();
