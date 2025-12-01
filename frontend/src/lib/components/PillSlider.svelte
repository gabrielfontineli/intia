<script lang="ts">
  // 0 = Left (Green), 1 = Middle (White), 2 = Right (Red)
  export let state: number = 1;

  $: leftPercentage = state === 0 ? 0 : state === 1 ? 50 : 100;
  $: sliderColor = getSliderColor(state);

  function getSliderColor(s: number) {
    if (s === 0) return 'rgb(34, 197, 94)'; // Green
    if (s === 1) return 'rgb(255, 255, 255)'; // White
    return 'rgb(239, 68, 68)'; // Red
  }

  function handleClick() {
    state = (state + 1) % 3;
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="pill-slider" on:click={handleClick}>
  <div class="track"></div>
  <div 
    class="thumb" 
    style="left: {leftPercentage}%; background-color: {sliderColor};"
  ></div>
</div>

<style>
  .pill-slider {
    position: relative;
    width: 60px;
    height: 8px;
    background: #e5e5e5;
    border-radius: 999px;
    margin-right: auto;
    cursor: pointer;
    user-select: none;
  }

  .track {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border-radius: 999px;
  }

  .thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    border: 2px solid #e5e5e5; /* Changed border to grey to stand out on white background */
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    transition: left 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), background-color 0.2s ease;
  }
</style>
