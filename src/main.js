import './style.css'
import { PLAYER_1, SYSTEM } from '@rcade/plugin-input-classic'

const app = document.querySelector('#app')
app.innerHTML = `
  <h1>aRCid house</h1>
  <p id="status">Press 1P START</p>
  <div id="controls"></div>
`

const status = document.querySelector('#status')
const controls = document.querySelector('#controls')

let gameStarted = false

function update() {
    if (!gameStarted) {
        if (SYSTEM.ONE_PLAYER) {
            gameStarted = true
            status.textContent = 'Game Started!'
        }
    } else {
        const inputs = []
        if (PLAYER_1.DPAD.up) inputs.push('↑')
        if (PLAYER_1.DPAD.down) inputs.push('↓')
        if (PLAYER_1.DPAD.left) inputs.push('←')
        if (PLAYER_1.DPAD.right) inputs.push('→')
        if (PLAYER_1.A) inputs.push('A')
        if (PLAYER_1.B) inputs.push('B')

        controls.textContent = inputs.length > 0 ? inputs.join(' ') : '-'
    }

    requestAnimationFrame(update)
}

update()
