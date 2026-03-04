import './style.css'
import * as Tone from 'tone'
import { PLAYER_1, SYSTEM } from '@rcade/plugin-input-classic'
import { PLAYER_1 as SP1 } from "@rcade/plugin-input-spinners"

const STEPS = 16
const DEFAULT_BPM = 120
const pattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

const SPIN1 = SP1.SPINNER

let playingStep = -1
let previousInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  a: false,
}

const app = document.querySelector('#app')

const status = document.querySelector('#status')
const stepGrid = document.querySelector('#step-grid')
const debug = document.querySelector('#debug')
const stepButtons = []

let gameStarted = false

let focusGraph = null
let focusedWidget = null
const DEFAULT_FOCUS_ID = "play-pause"


for (let index = 0; index < STEPS; index += 1) {
  const button = document.createElement('div')
  button.classList.add('step')
  button.classList.add('widget')
  stepGrid.appendChild(button)
  stepButtons.push(button)
}

const AudioEngine = {
  initialized: false,
  started: false,
  onStep: null,
  kick: null,
  sequence: null,
  bpm: DEFAULT_BPM,
  niceBPM: DEFAULT_BPM,

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
    this.niceBPM = bpm.toFixed(1)
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
}

function renderSteps() {
  for (let index = 0; index < STEPS; index += 1) {
    const button = stepButtons[index]
    button.classList.remove('step-active', 'step-playing')

    if (pattern[index] === 1) button.classList.add('step-active')
    if (index === playingStep) button.classList.add('step-playing')
  }

  debug.textContent = `step:${playingStep >= 0 ? playingStep : '-'}`
}

async function startPlayback() {
  try {
    await AudioEngine.startAudioContext()
    AudioEngine.play()
  } catch {
    status.textContent = 'Audio start blocked, try again'
  }
}

function handleControls() {
  // TODO: refactor to be more modular and just forward to handlers for each widget type.

  // TODO: we'll have player2 later so remove these consts.
  const left = PLAYER_1.DPAD.left
  const right = PLAYER_1.DPAD.right
  const up = PLAYER_1.DPAD.up
  const down = PLAYER_1.DPAD.down
  const a = PLAYER_1.A
  let newFocusedWidget = null

  // Left/right movement within the focused row
  if (left && !previousInput.left) {
    newFocusedWidget = focusGraph.get(focusedWidget)?.left
  }
  else if (right && !previousInput.right) {
    newFocusedWidget = focusGraph.get(focusedWidget)?.right
  }
  else if (up && !previousInput.up) {
    newFocusedWidget = focusGraph.get(focusedWidget)?.up
  }
  else if (down && !previousInput.down) {
    newFocusedWidget = focusGraph.get(focusedWidget)?.down
  }

  if (newFocusedWidget !== null) {
    // TODO some redundant classes here
    focusedWidget.blur()
    newFocusedWidget.focus()
    focusedWidget = newFocusedWidget
  }

  if (a && !previousInput.a) {
    if (focusedWidget.classList.contains('step')) {
      var foo = "TBD"
      pattern[foo] ^= 1
    } else {
      // TODO: handle other actionable widget types
    }
  }

  const delta1 = SPIN1.consume_step_delta();
  if (delta1 !== 0) {
    if (focusedWidget.id == 'bpm') {
      // TODO: make this smoother? hardwiring 0.2 is a hack to make it usable in browser, 
      // but it limits speed on spinner hardware
      if (delta1 > 0) {
        AudioEngine.incrementBPM(0.2)
      }
      if (delta1 < 0) {
        AudioEngine.incrementBPM(-0.2)
      }
      focusedWidget.value = AudioEngine.bpm.toFixed(1).toString()
    }
    else {
      // TODO: handle other spinnable widgets
    }
  }

  previousInput = { left, right, up, down, a }
}


function buildFocusGraph() {
  // TODO: handle two-player focus where there's two different focused elements at once!
  const neighbors = new Map()
  const rows = document.querySelectorAll('.widget-row')
  let prev_row_widgets = null
  if (focusedWidget === null) {
    focusedWidget = document.querySelector(`#${DEFAULT_FOCUS_ID}`)
    focusedWidget.focus()
  }
  rows.forEach(row => {
    const widgets = row.querySelectorAll('.widget')
    let left = null
    let up = null
    let down = null
    let right = null
    for (const widget of widgets) {
      const rect = widget.getBoundingClientRect()
      const center_x = rect.left + rect.width / 2
      if (left !== null) {
        neighbors.get(left).right = widget
      }

      if (prev_row_widgets !== null) {
        // Sort prev_row widgets by absolute distance of their center_x from the center_x of the current widget
        prev_row_widgets.sort((a, b) => {
          const dist_a = Math.abs((a.getBoundingClientRect().left + a.getBoundingClientRect().width / 2) - center_x)
          const dist_b = Math.abs((b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2) - center_x)
          return dist_a - dist_b
        })
        // And pick the nearest one
        up = prev_row_widgets[0]
      }
      neighbors.set(widget, {
        left: left,
        up: up,
        down: down,
        right: right,
        center_x: center_x,
      })
      left = widget
    }

    // Add down neighbors of previous row.
    // Note that going down then up doesn't necessarily put you back where you started,
    // and vice versa.
    if (prev_row_widgets !== null) {
      const sortable_widgets = Array.from(widgets)
      for (const prev_row_widget of prev_row_widgets) {
        sortable_widgets.sort((a, b) => {
          const center_x = neighbors.get(prev_row_widget).center_x
          const dist_a = Math.abs((a.getBoundingClientRect().left + a.getBoundingClientRect().width / 2) - center_x)
          const dist_b = Math.abs((b.getBoundingClientRect().left + b.getBoundingClientRect().width / 2) - center_x)
          return dist_a - dist_b
        })
        neighbors.get(prev_row_widget).down = sortable_widgets[0]
      }
    }
    // Wrap around in both horizontal directions
    const first = widgets[0]
    const last = widgets[widgets.length - 1]
    neighbors.get(last).right = first
    neighbors.get(first).left = last
    prev_row_widgets = Array.from(widgets)
  })
  return neighbors
}


function update() {
  if (!gameStarted) {
    if (SYSTEM.ONE_PLAYER) {
      gameStarted = true
      document.querySelector('#start-screen').classList.add('hidden')
      document.querySelector('#running-app').classList.remove('hidden')
      renderSteps()
      focusGraph = buildFocusGraph()
      startPlayback()
    }
  } else {
    handleControls()
    renderSteps()
  }
  requestAnimationFrame(update)
}

AudioEngine.init()
AudioEngine.onStep = (stepIndex) => {
  playingStep = stepIndex
  renderSteps()
}

update()
