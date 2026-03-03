import './style.css'
import * as Tone from 'tone'
import { PLAYER_1 } from '@rcade/plugin-input-classic'

const STEPS = 16
const DEFAULT_BPM = 120
const cursor = { x: 0, y: 1 } // y:0 reserved for global controls row
const pattern = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

let playingStep = -1
let previousInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  a: false,
}

const app = document.querySelector('#app')
app.innerHTML = `
  <h1>aRCid house</h1>
  <p id="status">Press 1P START to start audio</p>
  <div id="step-grid"></div>
  <p id="debug">x:0 y:1 step:-</p>
`

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
    this.setBPM(DEFAULT_BPM)
    this.initialized = true
  },

  setBPM(bpm) {
    Tone.Transport.bpm.value = bpm
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

async function startPlaybackFromGesture() {
  try {
    await AudioEngine.startAudioContext()
    AudioEngine.play()
    status.textContent = 'Playing at 120 BPM'
    window.removeEventListener('pointerdown', startPlaybackFromGesture)
    window.removeEventListener('keydown', startPlaybackFromGesture)
  } catch {
    status.textContent = 'Audio start blocked, try again'
  }
}

function update() {
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

  previousInput = { left, right, up, down, a }
  renderSteps()
  requestAnimationFrame(update)
}

AudioEngine.init()
AudioEngine.onStep = (stepIndex) => {
  playingStep = stepIndex
  renderSteps()
}
window.addEventListener('pointerdown', startPlaybackFromGesture)
window.addEventListener('keydown', startPlaybackFromGesture)

renderSteps()
update()
