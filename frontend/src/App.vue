<script setup lang="ts">
import { ref } from 'vue';
import SeatMap from './components/SeatMap.vue';
import ToastNotification, { type Toast } from './components/ToastNotification.vue';

const sessionId = 'sessao-cinema-101';
const toasts = ref<Toast[]>([]);

function addToast(toast: Omit<Toast, 'id'>) {
  const id = crypto.randomUUID();
  toasts.value.push({ ...toast, id });

  // Auto-dismiss após 4 segundos
  setTimeout(() => {
    dismissToast(id);
  }, 4000);
}

function dismissToast(id: string) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

function openNewTotemTab() {
  window.open(window.location.href, '_blank');
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white">
    <!-- Toast Notifications flutuantes -->
    <ToastNotification :toasts="toasts" @dismiss="dismissToast" />

    <!-- Top Bar com status do barramento -->
    <div class="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-4 py-2.5">
      <div class="max-w-5xl mx-auto flex items-center justify-between text-xs">
        <div class="flex items-center gap-2 text-slate-400">
          <span class="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>SSE & Redis Pub/Sub: <strong class="text-emerald-400 font-medium">Reativo em Tempo Real</strong></span>
        </div>

        <button
          @click="openNewTotemTab"
          class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition cursor-pointer font-medium"
        >
          <span>Abrir Outra Aba (Simular 2º Totem)</span>
          <span class="text-sm">↗</span>
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <main class="flex-1">
      <SeatMap :sessionId="sessionId" @toast="addToast" />
    </main>

    <!-- Footer -->
    <footer class="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
      <p>
        Cinema Seat Reservation Engine (PoC) — Fastify, MongoDB (WiredTiger Atomic), Redis Distributed Lock & Vue 3 SSE
      </p>
    </footer>
  </div>
</template>

