import './style.css'
import * as Tone from 'tone'
import { PLAYER_1, PLAYER_2, SYSTEM } from '@rcade/plugin-input-classic'
import { PLAYER_1 as SP1, PLAYER_2 as SP2 } from "@rcade/plugin-input-spinners"

const STEPS = 16
const DEFAULT_BPM = 130

const LOWEST_PITCH = 28 // MIDI E1 approx 41 Hz

const SPIN1 = SP1.SPINNER
const SPIN2 = SP2.SPINNER

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

const debug = document.querySelector('#debug span')
const playButton = document.querySelector('#play-pause')
const bpmControl = document.querySelector('#bpm')
let gameStarted = false

const focusedWidgetForPlayer = { 1: null, 2: null }

const DRUM_AREA = 'drums'
const BASS_AREA = 'bass'
const GLOBAL_AREA = 'global'


/**********************************************************************
 Build drum grid
 **********************************************************************/

const BD = 'BD'
const SD = 'SD'
const HH = 'HH'

const drumPattern = new Map([
  [BD, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0]],
  [SD, [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]],
  [HH, [0, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1]]
])

const DRUM_ROW_LABELS = Array.from(drumPattern.keys())
console.log(`Got drum labels ${DRUM_ROW_LABELS}`)

const stepButtons = []
const drumGrid = document.querySelector('#drums')

// Initialize drum sequencer grid UX
for (let row = 0; row < DRUM_ROW_LABELS.length; row += 1) {
    stepButtons.push([])
    const drumLabel = document.createElement('span')
    drumLabel.classList.add('track-label')
    drumLabel.textContent = DRUM_ROW_LABELS[row]
    drumLabel.dataset.row = row
    drumGrid.appendChild(drumLabel)
    console.log(`  building step row for ${DRUM_ROW_LABELS[row]} ${row}`)
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
        button.dataset.drumLabel = DRUM_ROW_LABELS[row]
        button.dataset.area = DRUM_AREA
        drumGrid.appendChild(button)
        stepButtons[row].push(button)
    }
}

/************************************************************************************
Build bass sequencer grid UX

Pitches are abstract semitones 0-n, relative to a lowest pitch.
We'll assume any audio backend we want supports MIDI pitch?
************************************************************************************/

// random initial bassline, why not
const REST = -1
const _bassInitChoices = [0, 0, 1, 12, 12, 12, 12, 14, 13, 10, 10, 9, 24, 24, 18, 18, REST, REST, REST, REST, REST, REST]

let bassPattern = []
for (let i = 0; i < STEPS; i += 1) {
    const j = Math.floor(Math.random() * _bassInitChoices.length)
    const initialPitch = _bassInitChoices[j]
    bassPattern.push({
      active: initialPitch !== REST,
      pitch: initialPitch !== REST ? initialPitch : 12
    })
}
console.debug(`Bass pattern: ${bassPattern}`)
const bassStepButtons = []
const bassGrid = document.querySelector('#bass-steps')

// Only one row for bass - now and forever?
for (let index = 0; index < STEPS; index += 1) {
    const button = document.createElement('div')
    button.setAttribute('tabindex', -1) // make focusable by our class system, but not via tab-key
    button.classList.add('step')
    button.classList.add('widget')
    button.dataset.area = BASS_AREA
    button.dataset.stepIndex = index // for mapping to pattern array
    button.dataset.row = 1
    button.dataset.col = index // redundant?
    bassGrid.appendChild(button)
    bassStepButtons.push(button)
}


// Bass pitch display
const bassKeyboard = document.querySelector('#bass-pitches')
const bassKeys = []

const PITCHES = 25
const BASS_KEY_PATTERN = [
  { note: 'E', isBlack: false },
  { note: 'F', isBlack: false },
  { note: 'F#', isBlack: true },
  { note: 'G', isBlack: false },
  { note: 'G#', isBlack: true },
  { note: 'A', isBlack: false },
  { note: 'A#', isBlack: true },
  { note: 'B', isBlack: false },
  { note: 'C', isBlack: false },
  { note: 'C#', isBlack: true },
  { note: 'D', isBlack: false },
  { note: 'D#', isBlack: true },
]

const bassKeyLayout = Array.from({ length: PITCHES }, (_, index) => BASS_KEY_PATTERN[index % BASS_KEY_PATTERN.length])
const totalWhiteKeys = bassKeyLayout.filter((key) => !key.isBlack).length
const whiteKeyWidth = 100 / totalWhiteKeys
const blackKeyWidth = whiteKeyWidth * 0.62
let whiteKeyIndex = 0

for (let index = 0; index < PITCHES; index += 1) {
    const { note, isBlack } = bassKeyLayout[index]
    const key = document.createElement('div')
    key.setAttribute('tabindex', -1)
    key.classList.add('keyboard-key')
    key.classList.add(isBlack ? 'keyboard-key-black' : 'keyboard-key-white')
    key.dataset.stepIndex = index
    key.dataset.row = 1
    key.dataset.col = index
    key.dataset.note = note // Is this useful?

    if (isBlack) {
        const left = Math.min(100 - blackKeyWidth, Math.max(0, whiteKeyIndex * whiteKeyWidth - blackKeyWidth / 2))
        key.style.setProperty('--key-left', `${left}%`)
        key.style.setProperty('--key-width', `${blackKeyWidth}%`)
    } else {
        key.style.setProperty('--key-left', `${whiteKeyIndex * whiteKeyWidth}%`)
        key.style.setProperty('--key-width', `${whiteKeyWidth}%`)
        whiteKeyIndex += 1
    }

    bassKeyboard.appendChild(key)
    bassKeys.push(key)
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

    /* INSTRUMENTS */
    this.kick = new Tone.MembraneSynth().toDestination()
    /* TODO not a very good snare */  
    this.snare = new Tone.NoiseSynth({ "noise": {"type": "pink"}}).toDestination()
    this.hh = new Tone.NoiseSynth({ "noise": {"type": "white"}}).toDestination()

    // fatsawtooth also sounds cool
    this.bass = new Tone.Synth({'oscillator': {'type': 'sawtooth'}}).toDestination()
    console.log("instruments set up!")

    /* Set up the main sequence loop */
    this.sequence = new Tone.Sequence((time, stepIndex) => {
      // Play everything that happens on the current tick.
      if (this.onStep) this.onStep(stepIndex)
      for (const [drumLabel, pattern] of drumPattern.entries()) {
        if (pattern[stepIndex] === 1) {
          const level = 0.9
          this.triggerDrum(drumLabel, time, level)
        }
      }
      const bassStep = bassPattern[stepIndex]
      if (bassStep.active) {
        this.triggerBass(bassStep.pitch, time, 0.9)
      }
    }, [...Array(STEPS).keys()], '16n')

    this.setBPM(DEFAULT_BPM)
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
    // TODO support more drum types
    if (sampleName === BD) {
      this.kick.triggerAttackRelease('C1', '8n', time, velocity)
    } else if (sampleName === SD) {
      // TODO don't hardcode velocity here
      this.snare.triggerAttackRelease('8n', time, velocity * 3)
    } else if (sampleName === HH) {
      // TODO don't hardcode velocity here
      this.hh.triggerAttackRelease('8n', time, velocity * 0.5)
    } else {
        console.log(`Unknown drum ${sampleName}`)
    }
  },

  triggerBass(stepPitch, time, velocity) {
      const pitch = new Tone.Frequency(stepPitch + LOWEST_PITCH, "midi")
      // console.debug(`*** PLAYING ${stepPitch} ${pitch} at ${time}`)
      this.bass.triggerAttackRelease(pitch, "16n")
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
  let spin = null;
  if (player == 1) {
    left = PLAYER_1.DPAD.left
    right = PLAYER_1.DPAD.right
    up = PLAYER_1.DPAD.up
    down = PLAYER_1.DPAD.down
    a = PLAYER_1.A
    spin = SPIN1
  } else {
    left = PLAYER_2.DPAD.left
    right = PLAYER_2.DPAD.right
    up = PLAYER_2.DPAD.up
    down = PLAYER_2.DPAD.down
    a = PLAYER_2.A
    spin = SPIN2
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
    focus(newFocusedWidget, player)
  }

  if (a && !previousInput[player].a) {
    console.log(`Firing ${a} for ${player}...`)
    if (focusedWidget?.classList.contains('step')) {
      const beat = parseInt(focusedWidget.dataset.stepIndex)
      if (focusedWidget.dataset.area === DRUM_AREA) {
        const drumLabel = focusedWidget.dataset.drumLabel
        drumPattern.get(drumLabel)[beat] ^= 1
      } else if (focusedWidget.dataset.area === BASS_AREA && player === 1) {
        bassPattern[beat].active = !bassPattern[beat].active
      }
    } else if (focusedWidget === playButton) {
      console.log("...Toggling play")
      if (AudioEngine.isPlaying()) {
        stopPlayback()
      } else {
        startPlayback()
      }
    } else {
      console.debug("...Ignoring A on a non-button widget")
    }
  }

  const delta = spin.consume_step_delta();
  if (delta !== 0) {
    if (focusedWidget.id === 'bpm') {
        bpmApplyDelta(delta)
    } else if (player === 1 && focusedWidget?.dataset?.area === BASS_AREA) {
      bassApplyDelta(focusedWidget, delta)
    } else {
    // TODO: handle other spinnable widgets
    }
  }
  previousInput[player] = { left, right, up, down, a }
}


function bassApplyDelta(focusedWidget, delta) {
  // TODO debounce this on local dev, test on RCade
  const beat = parseInt(focusedWidget.dataset.stepIndex)
  if (Number.isNaN(beat)) return
  const currentPitch = bassPattern[beat].pitch
  const incr = delta > 0? 1 : -1    
  const nextPitch = Math.max(0, Math.min(PITCHES - 1, currentPitch + incr))
  bassPattern[beat].pitch = nextPitch
}


function bpmApplyDelta(delta) {
  // TODO: make this smoother? hardwiring is a hack to make it usable in browser, 
  // but it limits speed on spinner hardware.
  const incr = 0.3    
  console.log(`Applying spin delta ${delta}`)
  if (delta > 0) {
    AudioEngine.incrementBPM(incr)
  }
  if (delta < 0) {
    AudioEngine.incrementBPM(-incr)
  }
  showBPM()
}


/**********************************************************************
 USER FEEDBACK
**********************************************************************/

function showBPM() {
  document.querySelector('#bpm').textContent = AudioEngine.bpm.toFixed(1).toString()
}

function focus(widget, playerNumber = 1) {
  const cls = `focus-p${playerNumber}`
  const previousWidget = focusedWidgetForPlayer[playerNumber]
  if (previousWidget && previousWidget !== widget) {
    previousWidget.classList.remove(cls)
  }
  widget.classList.add(cls)
  focusedWidgetForPlayer[playerNumber] = widget
}


/**********************************************************************
 ONSCREEN NAVIGATION HANDLING
**********************************************************************/

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
    const row = parseInt(currentWidget.dataset.row)
    // FOr now we assume all widgets occupy exactly 1 column.
    // If that changes, we can specify how many columns we span,
    // and from that calculate the end and center as needed.
    const col = parseInt(currentWidget.dataset.col)
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
    if (area == GLOBAL_AREA && direction == UP) {
      playerArea = ALLOWED_PLAYER_AREA[player]
      const playerWidgets = widgetsInArea(playerArea)
      if (playerWidgets.length === 0) {
        return currentWidget
      }
      const maxRow = Math.max(...playerWidgets.map(w => parseInt(w.dataset.row)))
      const bottomRowWidgets = playerWidgets
        .filter(w => parseInt(w.dataset.row) === maxRow)
        .sort((a, b) => parseInt(a.dataset.col) - parseInt(b.dataset.col))
      return closestColWidget(bottomRowWidgets, col) ?? bottomRowWidgets[0] ?? currentWidget
    }
    if (area != GLOBAL_AREA && direction == UP) {
      const areaWidgets = widgetsInArea(area)
      if (areaWidgets.length > 0) {
        const minRow = Math.min(...areaWidgets.map(w => parseInt(w.dataset.row)))
        if (row === minRow) {
          console.log(`going up to global from ${area} ${row} ${col}`)
          return lastFocusByPlayerAndArea[player][GLOBAL_AREA] ?? firstWidget(GLOBAL_AREA)
        }
      }
    }
    if (area != GLOBAL_AREA && direction == DOWN) {
      const areaWidgets = widgetsInArea(area)
      if (areaWidgets.length > 0) {
        const maxRow = Math.max(...areaWidgets.map(w => parseInt(w.dataset.row)))
        if (row === maxRow) {
          const globalWidgets = widgetsInArea(GLOBAL_AREA).sort(
            (a, b) => parseInt(a.dataset.col) - parseInt(b.dataset.col)
          )
          return closestColWidget(globalWidgets, col)
            ?? lastFocusByPlayerAndArea[player][GLOBAL_AREA]
            ?? firstWidget(GLOBAL_AREA)
        }
      }
    }
    // --- WITHIN-AREA NAVIGATION ---
    const widgets = Array.from(document.querySelectorAll(".widget"))
    // Only consider widgets in the same area (enforces player boundary)
    const areaWidgets = widgets.filter(w => w.dataset.area === area)
    let candidates = areaWidgets
    console.log(` ${candidates.length} of ${widgets.length} widgets in area ${area}`)
    if (direction === LEFT || direction === RIGHT) {
        candidates = candidates
          .filter(w => parseInt(w.dataset.row) === row)
          .sort((a, b) => parseInt(a.dataset.col) - parseInt(b.dataset.col))
    } else {
        candidates = candidates
          .filter(w => parseInt(w.dataset.col) === col)
          .sort((a, b) => parseInt(a.dataset.row) - parseInt(b.dataset.row))
    }
    console.log(` Down to ${candidates.length} of ${widgets.length} widgets in row ${row}`)

    if (candidates.length === 0) {
      return currentWidget
    }

    const currentIndex = candidates.findIndex(w => w === currentWidget)
    if (currentIndex === -1) {
      return currentWidget
    }

    let targetIndex = currentIndex
    if (direction === LEFT || direction === UP) {
      targetIndex = (currentIndex - 1 + candidates.length) % candidates.length
    } else if (direction === RIGHT || direction === DOWN) {
      targetIndex = (currentIndex + 1) % candidates.length
    }

    const w = candidates[targetIndex]
    console.log(`*** Found widget ${w}`)
    return w
}

function widgetsInArea(area) {
  const widgets = Array.from(document.querySelectorAll(".widget"))
  return widgets.filter(w => w.dataset.area === area)
}

function closestColWidget(widgets, targetCol) {
  if (widgets.length === 0) return null
  let best = widgets[0]
  let bestDistance = Math.abs(parseInt(best.dataset.col) - targetCol)
  for (const w of widgets) {
    const distance = Math.abs(parseInt(w.dataset.col) - targetCol)
    if (distance < bestDistance) {
      best = w
      bestDistance = distance
    }
  }
  return best
}


/**********************************************************************
 SEQUENCER GRID UX SETUP
 **********************************************************************/


function updateStepDisplay(element, index, pattern) {
  element.classList.remove('step-active', 'step-playing')
  if (pattern[index] > 0) element.classList.add('step-active')
  if (index === playingStep) element.classList.add('step-playing')
}

function renderStepRow(row, drumLabel) {
  let pattern = drumPattern.get(drumLabel)
  for (let index = 0; index < STEPS; index += 1) {
    const button = row[index]
    updateStepDisplay(button, index, pattern)
  }
}


function renderSteps() {
  for (const [index, row] of stepButtons.entries()) {
    const drumLabel = DRUM_ROW_LABELS[index]
    // console.log(`  Got label ${drumLabel}`)
    renderStepRow(row, drumLabel)
  }
  const focusedWidget = focusedWidgetForPlayer[2]
  debug.textContent = `step: ${playingStep >= 0 ? playingStep : '-'}, focus: ${focusedWidget?.id}`
}

function renderBassSteps() {
  for (let i = 0; i < STEPS; i += 1) {
    const step = bassStepButtons[i]
    step.classList.remove('step-active', 'step-playing')
    if (bassPattern[i].active) step.classList.add('step-active')
    if (i === playingStep) step.classList.add('step-playing')
  }
}

function renderBassKeys() {
    const selectedStep = selectedBassStep()
    const focusedPitch = selectedStep === null ? undefined : bassPattern[selectedStep].pitch

    for (let i = 0; i < PITCHES; i += 1) {
      const pitch = i
      const key = bassKeys[i]

      if (pitch === focusedPitch) {
          key.classList.add("editing-key")
      } else {
          key.classList.remove("editing-key")
      }

      if (playingStep >= 0 && bassPattern[playingStep].active && bassPattern[playingStep].pitch === pitch) {
          key.classList.add("playing-key")
      } else {
          key.classList.remove("playing-key")
      }
    }
}

function selectedBassStep() {
  const focused = focusedWidgetForPlayer[1]
  if (focused?.dataset?.area === BASS_AREA && focused.dataset?.stepIndex !== undefined) {
    return parseInt(focused.dataset.stepIndex)
  }
  const lastBassFocused = lastFocusByPlayerAndArea[1][BASS_AREA]
  if (lastBassFocused?.dataset?.stepIndex !== undefined) {
    return parseInt(lastBassFocused.dataset.stepIndex)
  }
  return null
}


/**************************************************************************************** 
 * MAIN GAME LOOP
 ***************************************************************************************/

function update() {
  if (gameStarted) {
    handleControls(1)
    handleControls(2)
    renderBassSteps()
    renderBassKeys()
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
      renderBassSteps()
      renderBassKeys()
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
