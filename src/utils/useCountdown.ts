import { onUnmounted, ref } from 'vue'

export function useCountdown(seconds = 60) {
  const remaining = ref(0)
  let timer: number | undefined

  function start() {
    remaining.value = seconds
    timer = window.setInterval(() => {
      remaining.value -= 1
      if (remaining.value <= 0 && timer !== undefined) {
        window.clearInterval(timer)
        timer = undefined
      }
    }, 1000)
  }

  onUnmounted(() => {
    if (timer !== undefined) window.clearInterval(timer)
  })

  return { remaining, start }
}
