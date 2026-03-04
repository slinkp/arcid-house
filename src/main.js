import './style.css'
import * as Tone from 'tone'
import { PLAYER_1, SYSTEM } from '@rcade/plugin-input-classic'
import { PLAYER_1 as SP1 } from "@rcade/plugin-input-spinners"

const STEPS = 16
const DEFAULT_BPM = 120
const cursor = { x: 0, y: 1 } // y:0 reserved for global controls row
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

for (let index = 0; index < STEPS; index += 1) {
  const button = document.createElement('div')
  button.className = 'step'
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
        this.triggerDrum('kick', time, 0.9)
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

function wrapStep(value) {
  if (value < 0) return STEPS - 1
  if (value >= STEPS) return 0
  return value
}

function renderSteps() {
  for (let index = 0; index < STEPS; index += 1) {
    const button = stepButtons[index]
    button.classList.remove('step-active', 'step-cursor', 'step-playing')

    if (pattern[index] === 1) button.classList.add('step-active')
    if (index === cursor.x && cursor.y === 1) button.classList.add('step-cursor')
    if (index === playingStep) button.classList.add('step-playing')
  }

  debug.textContent = `x:${cursor.x} y:${cursor.y} step:${playingStep >= 0 ? playingStep : '-'}`
}

async function startPlayback() {
  try {
    await AudioEngine.startAudioContext()
    AudioEngine.play()
  } catch {
    status.textContent = 'Audio start blocked, try again'
  }
}

let gameStarted = false;

function handleControls() {
  // TODO: we'll have player2 later so remove these consts.
  const left = PLAYER_1.DPAD.left
  const right = PLAYER_1.DPAD.right
  const up = PLAYER_1.DPAD.up
  const down = PLAYER_1.DPAD.down
  const a = PLAYER_1.A

  if (left && !previousInput.left) {
    cursor.x = wrapStep(cursor.x - 1)
  }

  if (right && !previousInput.right) {
    cursor.x = wrapStep(cursor.x + 1)
  }

  if (up && !previousInput.up) {
    // Reserved for future row navigation.
  }

  if (down && !previousInput.down) {
    // Reserved for future row navigation.
  }

  if (a && !previousInput.a) {
    pattern[cursor.x] ^= 1
  }

  // TEMPORARY: BPM control hardwired to spinner.
  const delta1 = SPIN1.consume_step_delta();
  // TODO: debounce to make smoother, or sometthing
  if (delta1 > 0) {
    AudioEngine.incrementBPM(0.2)
    status.textContent = `${AudioEngine.niceBPM} BPM`
  }
  if (delta1 < 0) {
    AudioEngine.incrementBPM(-0.2)
    status.textContent = `${AudioEngine.niceBPM} BPM`
  }

  previousInput = { left, right, up, down, a }
}

function update() {
  if (!gameStarted) {
    if (SYSTEM.ONE_PLAYER) {
      gameStarted = true
      document.querySelector('#start-screen').classList.add('hidden')
      document.querySelector('#running-app').classList.remove('hidden')
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
