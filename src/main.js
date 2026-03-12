import './style.css'
import * as Tone from 'tone'
import { PLAYER_1, PLAYER_2, SYSTEM } from '@rcade/plugin-input-classic'
import { PLAYER_1 as SP1 } from "@rcade/plugin-input-spinners"

const STEPS = 16
const DEFAULT_BPM = 120
const pattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

const SPIN1 = SP1.SPINNER

let playingStep = -1
let previousInput = {
    1: {
        left: false,
        right: false,
        up: false,
        down: false,
        a: false,
    },
    2: {
        left: false,
        right: false,
        up: false,
        down: false,
        a: false,
    }        
}

const status = document.querySelector('#status')
const debug = document.querySelector('#debug span')
const playButton = document.querySelector('#play-pause')
const bpmControl = document.querySelector('#bpm')
let gameStarted = false

const focusedWidgetForPlayer = { 1: null, 2: null }


/**********************************************************************
 Build drum grid
 **********************************************************************/

const DRUM_ROW_LABELS = ['SD', 'BD'];
const stepButtons = []
const drumGrid = document.querySelector('#drums')

for (let row = 0; row < DRUM_ROW_LABELS.length; row += 1) {
    stepButtons.push([])
    const drumLabel = document.createElement('span')
    drumLabel.classList.add('track-label')
    drumLabel.textContent = DRUM_ROW_LABELS[row]
    drumLabel.dataset.row = row
    drumGrid.appendChild(drumLabel)
    // Now the buttons for this row's pattern
    for (let index = 0; index < STEPS; index += 1) {
        const button = document.createElement('div')
        button.setAttribute('tabindex', -1) // make focusable by our class system, but not via tab-key
        button.classList.add('step')
        button.classList.add('widget')
        // TODO we need to indicate an instrument too
        button.dataset.stepIndex = index // for mapping to pattern array
        button.dataset.row = row
        button.dataset.col = index // redundant?
        drumGrid.appendChild(button)
        stepButtons[row].push(button)
    }
}

/**********************************************************************
 AUDIO SETUP
 **********************************************************************/


const AudioEngine = {
  initialized: false,
  started: false,
  onStep: null,
  kick: null,
  sequence: null,
  bpm: DEFAULT_BPM,

  init() {
    if (this.initialized) return

    this.kick = new Tone.MembraneSynth().toDestination()
    this.sequence = new Tone.Sequence((time, stepIndex) => {
      if (this.onStep) this.onStep(stepIndex)
      if (pattern[stepIndex] === 1) {
        const level = 0.9
        this.triggerDrum('kick', time, level)
      }
    }, [...Array(STEPS).keys()], '16n')

    this.sequence.start(0)
    this.initialized = true
  },

  setBPM(bpm) {
    this.bpm = bpm
    Tone.Transport.bpm.value = bpm
  },

  incrementBPM(delta) {
    this.setBPM(this.bpm + delta)
  },

  async startAudioContext() {
    if (this.started) return
    await Tone.start()
    this.started = true
  },

  play() {
    Tone.Transport.start()
  },

  stop() {
    Tone.Transport.stop()
  },

  triggerDrum(sampleName, time, velocity) {
    if (sampleName !== 'kick' || !this.kick) return
    this.kick.triggerAttackRelease('C1', '8n', time, velocity)
  },

  isPlaying() {
    return Tone.Transport.state === 'started'
  },
}

function startPlayback() {
  if (AudioEngine.isPlaying()) return
  AudioEngine.play()
  document.querySelector('#play-pause').classList.add('playing')
}

function stopPlayback() {
  AudioEngine.stop()
  document.querySelector('#play-pause').classList.remove('playing')
}


/**********************************************************************
 USER INPUT
 **********************************************************************/

function handleControls(player = 1) {
  // TODO: refactor to be more modular and just forward to handlers for each widget type.

  let left = null;
  let right = null;
  let up = null;
  let down = null;
  let a = null;
  if (player == 1) {
    left = PLAYER_1.DPAD.left
    right = PLAYER_1.DPAD.right
    up = PLAYER_1.DPAD.up
    down = PLAYER_1.DPAD.down
    a = PLAYER_1.A
  } else {
    left = PLAYER_2.DPAD.left
    right = PLAYER_2.DPAD.right
    up = PLAYER_2.DPAD.up
    down = PLAYER_2.DPAD.down
    a = PLAYER_2.A
  }
  let newFocusedWidget = null
  const focusedWidget = focusedWidgetForPlayer[player]

  // Left/right movement within the focused row
  if (left && !previousInput[player].left) {
    newFocusedWidget = findNeighbor(focusedWidget, LEFT, player)
  }
  else if (right && !previousInput[player].right) {
    newFocusedWidget = findNeighbor(focusedWidget, RIGHT, player)
  }
  else if (up && !previousInput[player].up) {
    newFocusedWidget = findNeighbor(focusedWidget, UP, player)
  }
  else if (down && !previousInput[player].down) {
    newFocusedWidget = findNeighbor(focusedWidget, DOWN, player)
  }

  if (newFocusedWidget !== null) {
    console.log(`New widget ${up} ${right} ${down} ${left} is ${newFocusedWidget}`)
    focus(newFocusedWidget, 1) // player 1 for now
  }

  if (a && !previousInput[player].a) {
    if (focusedWidget?.classList.contains('step')) {
      const beat = focusedWidget.dataset.stepIndex
      pattern[beat] ^= 1
    } else if (focusedWidget === playButton) {
      if (AudioEngine.isPlaying()) {
        stopPlayback()
      } else {
        startPlayback()
      }
    } else {
      // TODO: handle other actionable widget types
    }
  }

  const delta1 = SPIN1.consume_step_delta();
  if (delta1 !== 0) {
    if (focusedWidget.id === 'bpm') {
      // TODO: make this smoother? hardwiring 0.2 is a hack to make it usable in browser, 
      // but it limits speed on spinner hardware
      if (delta1 > 0) {
        AudioEngine.incrementBPM(0.2)
      }
      if (delta1 < 0) {
        AudioEngine.incrementBPM(-0.2)
      }
      showBPM()
    }
    else {
      // TODO: handle other spinnable widgets
    }
  }

  previousInput[player] = { left, right, up, down, a }
}

/**********************************************************************
 USER FEEDBACK
**********************************************************************/

function showBPM() {
  document.querySelector('#bpm').textContent = AudioEngine.bpm.toFixed(1).toString()
}

function focus(widget, playerNumber = 1) {
  const cls = `focus-p${playerNumber}`
  widget.classList.add(cls)
  focusedWidgetForPlayer[playerNumber]?.classList.remove(cls)
  focusedWidgetForPlayer[playerNumber] = widget
}


/**********************************************************************
 ONSCREEN NAVIGATION HANDLING
**********************************************************************/

const DRUM_AREA = 'drums'
const BASS_AREA = 'bass'
const GLOBAL_AREA = 'global'

const ALLOWED_PLAYER_AREA = { 1: BASS_AREA, 2: DRUM_AREA }

// TODO two-player
const LEFT = 'left'
const RIGHT = 'right'
const UP = 'up'
const DOWN = 'down'


// So going global → area → global → area lands you where you were, not on row 1 col 1.
const lastFocusByPlayerAndArea = {
    1: { GLOBAL_AREA: null, BASS_AREA: null },
    2: { GLOBAL_AREA: null, DRUM_AREA: null }
}

function firstWidget(area) {
  return document.querySelector(`#${area} .widget`)
}

function findNeighbor(currentWidget, direction, player) {
    console.log(`findNeighbor for ${direction} and player ${player} at ${currentWidget.id}`)
    if (currentWidget === null) return null;

    const area = currentWidget.dataset.area
    const row = currentWidget.dataset.row
    // FOr now we assume all widgets occupy exactly 1 column.
    // If that changes, we can specify how many columns we span,
    // and from that calculate the end and center as needed.
    const col = currentWidget.dataset.col
    let playerArea = null

    console.log(`  In ${area} row ${row} col ${col}`)  

    // Remember where we are leaving.
    lastFocusByPlayerAndArea[player][area] = currentWidget

    // --- CROSS-AREA BOUNDARY CASES ---
    if (area == GLOBAL_AREA && direction == DOWN) {
      playerArea = ALLOWED_PLAYER_AREA[player]
      console.log(`Navigating down from ${area} to ${playerArea}`)
      return lastFocusByPlayerAndArea[player][playerArea] ?? firstWidget(playerArea)
    }
    if (area != GLOBAL_AREA && direction == UP && row == 0) {
      console.log(`going up to global from ${area} ${row} ${col}`)
      lastFocusByPlayerAndArea[player][area] = currentWidget
      const prev = lastFocusByPlayerAndArea[player][GLOBAL_AREA]
      const fwpa = firstWidget(GLOBAL_AREA)
      console.log(`  Either ${prev} or ${fwpa}`)
      return lastFocusByPlayerAndArea[player][GLOBAL_AREA] ?? firstWidget(GLOBAL_AREA)
    }
    // --- WITHIN-AREA NAVIGATION ---
    const widgets = Array.from(document.querySelectorAll(".widget"))
    // Only consider widgets in the same area (enforces player boundary)
    let candidates = widgets.filter(w => w.dataset.area === area)
    console.log(` ${candidates.length} of ${widgets.length} widgets in area ${area}`)
    if (direction === LEFT || direction === RIGHT){
        candidates = candidates.filter(w => w.dataset.row === row)
        candidates.sort((a, b) => parseInt(a.col) - parseInt(b.col))
    } else {
        candidates = candidates.filter(w => w.dataset.col === col)
        candidates.sort((a, b) => parseInt(a.row) - parseInt(b.row))
    }

    let w = null
    if (direction == LEFT) {
        candidates.reverse()
        for (w of candidates) {
          if (w.col < currentWidget.col) break
        }
    } else if (direction == RIGHT) {
        for (w of candidates) {
            if (w.col > currentWidget.col) break
        }
    } else if (direction == UP) {
        candidates.reverse()
        for (w of candidates) {
            if (w.row < currentWidget.row) break
        }
    } else if (direction == DOWN) {
        for (w of candidates) {
            if (w.row > currentWidget.row) break
        }
    }
    console.log(`*** Found widget ${w}`)
    return w
}


/**********************************************************************
 SEQUENCER GRID UX SETUP
 **********************************************************************/

function renderStepRow(row) {
  for (let index = 0; index < STEPS; index += 1) {
    const button = row[index]
    button.classList.remove('step-active', 'step-playing')
    if (pattern[index] === 1) button.classList.add('step-active')
    if (index === playingStep) button.classList.add('step-playing')
  }
  const focusedWidget = focusedWidgetForPlayer[1]
  debug.textContent = `step: ${playingStep >= 0 ? playingStep : '-'}, focus: ${focusedWidget?.id}`
}


function renderSteps() {
    for (const row of stepButtons) renderStepRow(row);
}


/**************************************************************************************** 
 * MAIN GAME LOOP
 ***************************************************************************************/

function update() {
  if (gameStarted) {
    handleControls(1)
    handleControls(2)
    renderSteps()
  } else if (SYSTEM.ONE_PLAYER || SYSTEM.TWO_PLAYER) {
    startGame()
  }
  requestAnimationFrame(update)
}

function startGame() {
  if (!gameStarted) {
      gameStarted = true
      showBPM()
      document.querySelector('#start-screen').classList.add('hidden')
      document.querySelector('#running-app').classList.remove('hidden')
      renderSteps()
      focus(playButton, 1)
      focus(bpmControl, 2)
   }
}


/************************************************************************
 Global initialization on load
*************************************************************************/

AudioEngine.init()
try {
  await AudioEngine.startAudioContext()
} catch {
  document.querySelector('#error').textContent = 'Audio start blocked, please restart the game'
}

AudioEngine.onStep = (stepIndex) => {
  playingStep = stepIndex
  renderSteps() // need to update immediately to show the active step ... or not? game loop suffices?
}

update()
