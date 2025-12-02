<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { page } from '$app/stores';
  import { getPersonById, getMessages, createMessage, previewScore, autocomplete, type Person, type Message } from '$lib/api';
  import { buildWordCloud, layoutWordCloud, scaleFontSize, type PositionedWordCloudEntry, type WordCloudEntry } from '$lib/word-cloud';
  import PillSlider from '$lib/components/PillSlider.svelte';

  let person: Person | null = null;
  let messages: Message[] = [];
  let allMessages: Message[] = [];
  let wordCloudEntries: WordCloudEntry[] = [];
  let positionedWordCloud: PositionedWordCloudEntry[] = [];
  let wordCloudMin = 0;
  let wordCloudMax = 0;
  let isCompact = false;
  let wordCloudFontScale = 1;
  let wordCloudSpread = 1;
  let loading = true;
  let error: string | null = null;

  let commentText = '';
  let previewScoreValue: number | null = null;
  let fullAutocomplete: string | null = null;
  let autocompleteSuffix: string | null = null;
  let sliderState = 1; // 0=positive, 1=neutral, 2=negative
  let debounceTimeout: number | null = null;
  let autocompleteTimeout: number | null = null;
  let ws: WebSocket | null = null;
  let messagesListElement: HTMLDivElement | null = null;
  let showFadeTop = false;
  let showScrollbar = false;
  let pfpAnimationClass = '';
  let personId: number;
  let textareaBackgroundColor = '#ffffff';
  let textareaTextColor = '#000000';

function updateViewportMode() {
  if (typeof window === 'undefined') return;
  isCompact = window.innerWidth <= 640;
}

$: wordCloudFontScale = isCompact ? 0.85 : 1.2;
$: wordCloudSpread = isCompact ? 0.7 : 1;

  $: {
    const paramId = $page.params.id;
    personId = paramId ? Number.parseInt(paramId, 10) : NaN;
  }
  $: textareaBackgroundColor = previewScoreValue !== null ? getScoreColor(previewScoreValue) : '#ffffff';
  $: textareaTextColor = previewScoreValue !== null ? getTextColor(previewScoreValue) : '#000000';

  // Update scroll state when messages change
  $: if (messages && messagesListElement) {
    setTimeout(() => updateScrollState(), 50);
  }

function refreshWordCloud(source: Message[]) {
  const limit = isCompact ? 9 : 16;
  const cloud = buildWordCloud(source, limit);
  wordCloudEntries = cloud;
  if (cloud.length) {
    const counts = cloud.map(({ count }) => count);
    wordCloudMax = Math.max(...counts);
    wordCloudMin = Math.min(...counts);
  } else {
    wordCloudMax = 0;
    wordCloudMin = 0;
  }
}

$: {
  if (wordCloudEntries.length) {
    positionedWordCloud = layoutWordCloud(wordCloudEntries, wordCloudMin, wordCloudMax, wordCloudSpread);
  } else {
    positionedWordCloud = [];
  }
}

  function getWordOpacity(count: number): number {
  if (!wordCloudEntries.length || wordCloudMax === wordCloudMin) {
      return 0.75;
    }
    const normalized = (count - wordCloudMin) / (wordCloudMax - wordCloudMin);
    return +(0.5 + normalized * 0.5).toFixed(2);
  }

  async function loadData() {
    if (isNaN(personId)) {
      error = 'ID da pessoa inválido';
      loading = false;
      return;
    }

    try {
      const [personData, fetchedMessages] = await Promise.all([
        getPersonById(personId),
        getMessages(personId)
      ]);
      person = personData;
      allMessages = fetchedMessages;
      refreshWordCloud(allMessages);
      // Show only last 8 comments (highest IDs), oldest first (newest at bottom)
      messages = [...allMessages].sort((a, b) => b.id - a.id).slice(0, 8).reverse();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Falha ao carregar dados';
    } finally {
      loading = false;
    }
  }

  async function handleTextInput() {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    if (autocompleteTimeout) {
      clearTimeout(autocompleteTimeout);
    }

    if (!commentText.trim()) {
      previewScoreValue = null;
      fullAutocomplete = null;
      autocompleteSuffix = null;
      return;
    }

    debounceTimeout = window.setTimeout(async () => {
      try {
        previewScoreValue = await previewScore(commentText);
      } catch (e) {
        console.error('Failed to preview score:', e);
        previewScoreValue = null;
      }
    }, 400);

    autocompleteTimeout = window.setTimeout(async () => {
      try {
        if (sliderState !== 1 && commentText.trim()) {
          const suggestion = await autocomplete(commentText, sliderState);
          if (suggestion) {
            const needsSpace = commentText.length > 0 && !commentText.endsWith(' ');
            fullAutocomplete = commentText + (needsSpace ? ' ' : '') + suggestion;
          } else {
            fullAutocomplete = null;
          }
        } else {
          fullAutocomplete = null;
        }
        updateAutocompleteSuffix();
      } catch (e) {
        console.error('Failed to get autocomplete suggestion:', e);
        fullAutocomplete = null;
        autocompleteSuffix = null;
      }
    }, 500);

    // While waiting for the next server suggestion, keep updating
    // how much of the current suggestion is still valid as you type.
    updateAutocompleteSuffix();
  }

  async function submitComment() {
    if (!commentText.trim() || !person) return;

    try {
      await createMessage(commentText, person.id);
      commentText = '';
      previewScoreValue = null;
      // Don't reload data, WebSocket will update it
    } catch (e) {
      error = e instanceof Error ? e.message : 'Falha ao enviar comentário';
    }
  }

  function updateAutocompleteSuffix() {
    if (!fullAutocomplete || !commentText) {
      autocompleteSuffix = null;
      return;
    }

    const target = fullAutocomplete;
    const text = commentText;

    if (!target.startsWith(text)) {
      autocompleteSuffix = null;
      return;
    }

    const rest = target.slice(text.length);
    autocompleteSuffix = rest.length ? rest : null;
  }

  function getScoreColor(score: number): string {
    // 0 = green (34, 197, 94), 0.5 = white (255, 255, 255), 1 = red (239, 68, 68)
    if (score <= 0.5) {
      // Interpolate between green and white
      const t = score * 2; // 0 -> 0, 0.5 -> 1
      const r = Math.round(34 + (255 - 34) * t);
      const g = Math.round(197 + (255 - 197) * t);
      const b = Math.round(94 + (255 - 94) * t);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Interpolate between white and red
      const t = (score - 0.5) * 2; // 0.5 -> 0, 1 -> 1
      const r = Math.round(255 + (239 - 255) * t);
      const g = Math.round(255 + (68 - 255) * t);
      const b = Math.round(255 + (68 - 255) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  function getTextColor(score: number): string {
    if (score > 0.75 || score < 0.25) {
      return 'white';
    }
    return 'black';
  }

  function shouldShake(score: number): boolean {
    return score > 0.75;
  }

  function shouldBounce(score: number): boolean {
    return score < 0.25;
  }

  function getScoreTitle(score: number): string {
    if (score < 0.25) return 'Santo';
    if (score < 0.4) return 'Bacana';
    if (score < 0.6) return 'Normal';
    if (score < 0.75) return 'Babaca';
    return 'Arrombado';
  }

  function setupWebSocket() {
    if (isNaN(personId)) return;
    
    // Use relative WebSocket URL based on current page protocol
    const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof window !== 'undefined' ? window.location.host : 'localhost:8000';
    const wsUrl = `${protocol}//${host}/ws/${personId}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'new_message') {
          // If we have 8 messages, remove the oldest first (it will fade out)
          if (messages.length === 8) {
            messages = messages.slice(1);
            // Wait for DOM to update and existing messages to start moving up
            await tick();
            // Delay to let existing messages move up smoothly
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          
          // Now add the new message (it will slide in from bottom)
          messages = [...messages, data.message]
            .sort((a, b) => a.id - b.id)
            .slice(-8);

          if (!allMessages.some((existing) => existing.id === data.message.id)) {
            allMessages = [...allMessages, data.message];
            refreshWordCloud(allMessages);
          }
          
          // Trigger pfp animation based on message score
          const messageScore = data.message.message_score;
          if (messageScore > 0.75) {
            pfpAnimationClass = 'pfp-hit';
            setTimeout(() => { pfpAnimationClass = ''; }, 600);
          } else if (messageScore < 0.25) {
            pfpAnimationClass = 'pfp-happy';
            setTimeout(() => { pfpAnimationClass = ''; }, 1000);
          }
          
          // Update average score if provided
          if (person && data.average_score !== undefined) {
            person.average_score = data.average_score;
            person = person; // Trigger reactivity
          }
          
          // Scroll to bottom after new message is added
          await tick();
          scrollToBottom();
          // Update scroll state after DOM updates
          await tick();
          updateScrollState();
        }
      } catch (e) {
        console.error('Error parsing WebSocket message:', e);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  function updateScrollState() {
    if (messagesListElement) {
      const hasOverflow = messagesListElement.scrollHeight - messagesListElement.clientHeight > 5;
      showScrollbar = hasOverflow;
      showFadeTop = messagesListElement.scrollTop > 5;
    }
  }

  function scrollToBottom() {
    if (messagesListElement) {
      // Scroll to absolute bottom to ensure last message is fully visible
      messagesListElement.scrollTop = messagesListElement.scrollHeight - messagesListElement.clientHeight;
      updateScrollState();
    }
  }

  onMount(() => {
    updateViewportMode();

    const handleResize = () => {
      const previous = isCompact;
      updateViewportMode();
      if (previous !== isCompact) {
        if (allMessages.length) {
          refreshWordCloud(allMessages);
        }
      } else if (wordCloudEntries.length) {
        positionedWordCloud = layoutWordCloud(
          wordCloudEntries,
          wordCloudMin,
          wordCloudMax,
          wordCloudSpread
        );
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
    }

    loadData().then(() => {
      setupWebSocket();
      // Scroll to bottom after a small delay to ensure DOM is updated
      setTimeout(() => {
        scrollToBottom();
        updateScrollState();
      }, 100);
    });

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize);
      }
    };
  });

  onDestroy(() => {
    if (ws) {
      ws.close();
    }
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
  });
</script>

<div class="container">
  {#if loading}
    <p>carregando...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if person}
    <div class="content">
      <div class="top-section">
        <div class="profile">
          <div class="pfp-container {pfpAnimationClass}">
            {#if person.pfp_image}
              <img src={person.pfp_image} alt={person.name} />
            {:else}
              <div class="pfp-placeholder">
                <span>{person.name.charAt(0).toUpperCase()}</span>
              </div>
            {/if}
          </div>
          <h1 class="name">{person.name}</h1>
          <div 
            class="average-score-label"
            style="background-color: {person.average_score !== null && person.average_score !== undefined ? getScoreColor(person.average_score) : '#f5f5f5'}; color: {person.average_score !== null && person.average_score !== undefined ? getTextColor(person.average_score) : '#666'};"
          >
            {#if person.average_score !== null && person.average_score !== undefined}
              <span class="score-title">{getScoreTitle(person.average_score)}</span>
              <span class="score-value">{(person.average_score * 10).toFixed(1)}</span>
            {:else}
              <span class="score-title">Sem score</span>
            {/if}
          </div>
        </div>

        <div class="comments-list-section">
          <div class="messages-list-wrapper">
            {#if showFadeTop}
              <div class="messages-list-fade-top"></div>
            {/if}
            <div 
              class="messages-list {showScrollbar ? 'has-scrollbar' : ''}"
              bind:this={messagesListElement}
              on:scroll={() => {
                updateScrollState();
              }}
            >
              {#each messages as message (message.id)}
                <div 
                  class="message-item {shouldShake(message.message_score) ? 'shake' : ''} {shouldBounce(message.message_score) ? 'bounce' : ''}" 
                  style="background-color: {getScoreColor(message.message_score)}"
                  in:fly={{ y: 20, duration: 400, easing: (t) => t * (2 - t) }}
                  out:fade={{ duration: 250 }}
                  animate:flip={{ duration: 400, easing: (t) => t * (2 - t) }}
                >
                  <p class="message-text" style="color: {getTextColor(message.message_score)}">{message.message}</p>
                </div>
              {:else}
                <p class="no-messages">Ainda não há comentários.</p>
              {/each}
            </div>
          </div>
        </div>
      </div>

      <div class="insights">
        <div class="word-cloud-card">
          {#if positionedWordCloud.length}
            <div class="word-cloud">
              {#each positionedWordCloud as item (item.word)}
                <span
                  class="word-cloud__word word-cloud__word--{item.sentiment}"
                  style="
                    left: {item.left}%;
                    top: {item.top}%;
                    font-size: {(scaleFontSize(item.count, wordCloudMin, wordCloudMax) * wordCloudFontScale).toFixed(2)}rem;
                    opacity: {getWordOpacity(item.count)};
                    z-index: {item.zIndex};"
                  >{item.word}</span>
              {/each}
            </div>
          {:else}
            <p class="word-cloud__empty">sem palavras polarizadas ainda.</p>
          {/if}
        </div>
      </div>

      <form on:submit|preventDefault={submitComment} class="comment-form">
        <div class="form-header">
          <PillSlider bind:state={sliderState} />
          <div class="char-info">
            <div class="char-count">{commentText.length}/150</div>
          </div>
        </div>
        <div 
          class="textarea-wrapper" 
          style="background-color: {textareaBackgroundColor};"
        >
          {#if autocompleteSuffix}
            <div
              class="autocomplete-ghost"
              in:fade={{ duration: 120 }}
              out:fade={{ duration: 120 }}
            >
              {commentText}<span class="ghost-suggestion">{autocompleteSuffix}</span>
            </div>
          {/if}
          <textarea 
            bind:value={commentText} 
            on:input={handleTextInput}
            placeholder="escreva sua mensagem anônima" 
            rows="3"
            maxlength="150"
            style="color: {textareaTextColor};"
          ></textarea>
        </div>
        <button type="submit" disabled={!commentText.trim()}>enviar</button>
      </form>
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 3rem;
    min-height: 60vh;
  }

  .error {
    color: red;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .top-section {
    display: flex;
    gap: 3rem;
    align-items: flex-start;
    justify-content: center;
  }

  .profile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    flex-shrink: 0;
  }

  .pfp-container {
    width: 300px;
    height: 300px;
    border-radius: 8px;
    overflow: hidden;
    background: #e0e0e0;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: box-shadow 0.1s ease;
  }

  .pfp-container.pfp-hit {
    animation: pfpHitShake 0.15s infinite, pfpRedFlash 0.6s ease-out;
  }

  .pfp-container.pfp-happy {
    animation: pfpHappyBounce 0.5s ease-in-out 2, pfpGreenFlash 1s ease-out;
  }

  @keyframes pfpHitShake {
    0%, 100% {
      transform: translate(0, 0) rotate(0deg);
    }
    10% {
      transform: translate(-4px, -2px) rotate(-1deg);
    }
    20% {
      transform: translate(4px, 2px) rotate(1deg);
    }
    30% {
      transform: translate(-4px, 2px) rotate(-1deg);
    }
    40% {
      transform: translate(4px, -2px) rotate(1deg);
    }
    50% {
      transform: translate(-3px, -2px) rotate(-0.8deg);
    }
    60% {
      transform: translate(3px, 2px) rotate(0.8deg);
    }
    70% {
      transform: translate(-3px, -2px) rotate(-0.8deg);
    }
    80% {
      transform: translate(3px, 2px) rotate(0.8deg);
    }
    90% {
      transform: translate(-2px, -1px) rotate(-0.5deg);
    }
  }

  @keyframes pfpRedFlash {
    0% {
      box-shadow: 0 0 0px rgba(239, 68, 68, 0);
    }
    20% {
      box-shadow: 0 0 30px rgba(239, 68, 68, 1), 0 0 60px rgba(239, 68, 68, 0.5);
    }
    100% {
      box-shadow: 0 0 0px rgba(239, 68, 68, 0);
    }
  }

  @keyframes pfpHappyBounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-8px);
    }
  }

  @keyframes pfpGreenFlash {
    0% {
      box-shadow: 0 0 0px rgba(34, 197, 94, 0);
    }
    20% {
      box-shadow: 0 0 30px rgba(34, 197, 94, 1), 0 0 60px rgba(34, 197, 94, 0.5);
    }
    100% {
      box-shadow: 0 0 0px rgba(34, 197, 94, 0);
    }
  }

  .pfp-container img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pfp-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #bdbdbd;
    font-size: 6rem;
    font-weight: bold;
    color: white;
  }

  .name {
    font-size: 2.5rem;
    font-weight: bold;
    margin: 0;
    text-align: center;
    line-height: 1;
  }

  .average-score-label {
    margin-top: 0;
    padding: 0.3rem 0.75rem;
    border-radius: 4px;
    text-align: center;
    transition: background-color 0.3s ease, color 0.3s ease;
    border: 1px solid #ddd;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
  }

  .score-title {
    font-size: 1rem;
    font-weight: 700;
  }

  .score-value {
    font-size: 0.9rem;
    font-weight: 500;
  }

  .comments-list-section {
    width: 400px;
    max-width: 400px;
    flex-shrink: 0;
  }

  .insights {
    display: flex;
    justify-content: center;
  }

  .word-cloud-card {
    width: 100%;
    max-width: 580px;
    margin: 0 auto;
    background: #f5f5f0;
    border-radius: 12px;
    padding: 1rem;
    box-sizing: border-box;
    border: 1px solid #e2e2da;
  }

  .word-cloud {
    position: relative;
    width: 100%;
    min-height: clamp(220px, 28vw, 320px);
    height: clamp(240px, 32vw, 360px);
  }

  .word-cloud__word {
    position: absolute;
    font-weight: 600;
    line-height: 1;
    color: #1f2933;
    transition: transform 0.2s ease;
    transform: translate(-50%, -50%);
    white-space: nowrap;
  }

  .word-cloud__word--positive {
    color: #15803d;
  }

  .word-cloud__word--negative {
    color: #b91c1c;
  }

  .word-cloud__word:hover {
    transform: translate(-50%, -50%) scale(1.08);
  }

  .word-cloud__empty {
    text-align: center;
    color: #666;
    margin: 0;
  }

  @media (max-width: 768px) {
    .container {
      padding: 1rem;
      margin: 0 0.5rem;
    }

    .top-section {
      flex-direction: column;
      gap: 2rem;
      align-items: center;
    }

    .profile {
      align-items: center;
      width: 100%;
    }

    .pfp-container {
      width: 200px;
      height: 200px;
    }

    .pfp-placeholder {
      font-size: 4rem;
    }

    .name {
      font-size: 1.6rem;
    }

    .comments-list-section {
      width: 100%;
      max-width: 100%;
    }

    .messages-list {
      max-height: 300px;
    }

    .insights {
      width: 100%;
    }

    .word-cloud-card {
      padding: 1rem;
    }

    .word-cloud-card {
      max-width: 100%;
      padding: 0.85rem;
      border-radius: 10px;
    }

    .word-cloud {
      min-height: 200px;
      height: clamp(220px, 60vw, 320px);
    }
  }

  .comment-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0;
    background: #f5f5f5;
    border-radius: 8px;
    max-width: 800px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .char-info {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.15rem;
  }

  .char-count {
    font-size: 0.9rem;
    color: #666;
  }

  .textarea-wrapper {
    position: relative;
    border-radius: 4px;
  }

  .autocomplete-ghost {
    position: absolute;
    inset: 0;
    padding: 0.75rem;
    border-radius: 4px;
    color: transparent; /* hide user text portion */
    white-space: pre-wrap;
    pointer-events: none;
    font-family: inherit;
    font-size: 1rem;
    line-height: 1.4;
    overflow: hidden;
  }

  .ghost-suggestion {
    color: rgba(0, 0, 0, 0.28);
  }

  .comment-form textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
    background-color: transparent;
    font-size: 1rem;
    line-height: 1.4;
    transition: color 0.3s ease;
  }

  .comment-form button {
    padding: 0.75rem 1.5rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
  }

  .comment-form button:hover:not(:disabled) {
    background: #0056b3;
  }

  .comment-form button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  .messages-list-wrapper {
    position: relative;
    /* 8 messages: each has padding (0.75rem top + 0.75rem bottom = 1.5rem) + text line-height (1rem) = 2.5rem per message */
    /* 7 gaps between 8 messages = 7 * 0.75rem = 5.25rem */
    /* add +12px slack for borders/rendering to ensure 8 one-line messages fit */
    height: calc(8 * 2.5rem + 7 * 0.75rem + 4px + 12px);
    min-height: calc(8 * 2.5rem + 7 * 0.75rem + 4px + 12px);
    max-height: calc(8 * 2.5rem + 7 * 0.75rem + 4px + 12px);
    overflow: hidden;
  }

  .messages-list-fade-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 20px;
    background: linear-gradient(to bottom, #f5f5f0, transparent);
    pointer-events: none;
    z-index: 10;
  }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    /* 8 messages: each has padding (0.75rem top + 0.75rem bottom = 1.5rem) + text line-height (1rem) = 2.5rem per message */
    /* 7 gaps between 8 messages = 7 * 0.75rem = 5.25rem */
    /* add same +12px slack as wrapper */
    height: calc(8 * 2.5rem + 7 * 0.75rem + 4px + 12px);
    min-height: calc(8 * 2.5rem + 7 * 0.75rem + 4px + 12px);
    max-height: calc(8 * 2.5rem + 7 * 0.75rem + 4px + 12px);
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 4px 0 4px; /* no bottom padding so 8 one-line messages fit without scroll */
    box-sizing: border-box;
    scrollbar-width: none; /* Firefox */
    -ms-overflow-style: none; /* IE and Edge */
    scroll-padding-bottom: 0;
  }

  /* Desktop: show a themed scrollbar only on hover */
  @media (min-width: 769px) {
    /* Reserve gutter so width doesn't change when scrollbar appears */
    .messages-list {
      scrollbar-gutter: stable both-edges; /* Chrome/Edge/Safari */
      scrollbar-width: thin; /* Firefox: thin all the time (color transparent until hover) */
    }

    /* WebKit: keep width stable, fade via background */
    .messages-list::-webkit-scrollbar {
      width: 8px; /* stable width to avoid layout shift */
      height: 8px;
    }
    .messages-list::-webkit-scrollbar-button { display: none; }
    .messages-list::-webkit-scrollbar-track {
      background: transparent;
      transition: background-color 160ms ease;
    }
    .messages-list::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0); /* transparent by default */
      border-radius: 8px;
      border: 2px solid transparent;
      transition: background-color 160ms ease;
    }
    .messages-list.has-scrollbar:hover::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.9); /* fade in on hover only if has overflow */
    }
    .messages-list.has-scrollbar:hover::-webkit-scrollbar-thumb:hover {
      background: rgba(0,0,0,1);
    }

    /* Firefox colors: transparent by default, black on hover only if has overflow */
    .messages-list { scrollbar-color: transparent transparent; }
    .messages-list.has-scrollbar:hover { scrollbar-color: #000 transparent; }
  }

  .message-item {
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    transition: transform 0.4s ease;
    overflow-wrap: break-word;
    word-wrap: break-word;
    max-width: 100%;
  }

  .message-item.shake {
    animation: shake 0.15s infinite;
  }

  .message-item.bounce {
    animation: bounce 1s ease-in-out infinite;
  }

  @keyframes shake {
    0%, 100% {
      transform: translate(0, 0) rotate(0deg);
    }
    10% {
      transform: translate(-3px, -1px) rotate(-0.8deg);
    }
    20% {
      transform: translate(3px, 1px) rotate(0.8deg);
    }
    30% {
      transform: translate(-3px, 1px) rotate(-0.8deg);
    }
    40% {
      transform: translate(3px, -1px) rotate(0.8deg);
    }
    50% {
      transform: translate(-2px, -1px) rotate(-0.5deg);
    }
    60% {
      transform: translate(2px, 1px) rotate(0.5deg);
    }
    70% {
      transform: translate(-2px, -1px) rotate(-0.5deg);
    }
    80% {
      transform: translate(2px, 1px) rotate(0.5deg);
    }
    90% {
      transform: translate(-1px, -0.5px) rotate(-0.3deg);
    }
  }

  @keyframes bounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-2px);
    }
  }

  .message-text {
    margin: 0;
    font-size: 1rem;
    line-height: 1rem; /* exact one-line height for sizing calc */
    word-wrap: break-word;
    overflow-wrap: break-word;
    white-space: normal;
  }

  .message-score {
    font-size: 0.9rem;
    color: #666;
  }

  .no-messages {
    text-align: center;
    color: #999;
    padding: 2rem;
  }
</style>


