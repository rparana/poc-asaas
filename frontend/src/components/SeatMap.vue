<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Toast } from './ToastNotification.vue';

export interface SeatItem {
  seatNumber: string;
  status: 'AVAILABLE' | 'HELD' | 'RESERVED';
  cartId?: string | null;
  expiresAt?: string | null;
}

interface ApiResponse {
  message?: string;
  seat?: SeatItem;
  seats?: SeatItem[];
  sessionId?: string;
  totalSeats?: number;
  availableCount?: number;
  heldCount?: number;
  reservedCount?: number;
}

const props = defineProps<{
  sessionId: string;
}>();

const emit = defineEmits<(e: 'toast', toast: Omit<Toast, 'id'>) => void>();

// Cart ID persistente na sessão do navegador
const cartId = ref<string>('');
const isInitializing = ref<boolean>(true);
const isProcessing = ref<string | null>(null); // seatNumber sendo processado
const seats = ref<SeatItem[]>([]);
const currentTime = ref<number>(Date.now());
let timerInterval: ReturnType<typeof setInterval> | null = null;
let eventSource: EventSource | null = null;

// Inicializa cartId único
function initCartId() {
  let stored = sessionStorage.getItem('cine_cart_id');
  if (!stored) {
    stored = `totem-${crypto.randomUUID().slice(0, 8)}`;
    sessionStorage.setItem('cine_cart_id', stored);
  }
  cartId.value = stored;
}

function resetTotemCart() {
  const newCart = `totem-${crypto.randomUUID().slice(0, 8)}`;
  sessionStorage.setItem('cine_cart_id', newCart);
  cartId.value = newCart;
  emit('toast', {
    type: 'info',
    title: 'Novo Totem / Carrinho',
    message: `Identificador alterado para: ${newCart}. Teste disputas entre abas!`,
  });
}

// Carrega estado inicial da sessão
async function fetchSeats() {
  try {
    const res = await fetch(`/api/v1/sessions/${props.sessionId}/seats`);
    if (!res.ok) throw new Error('Falha ao carregar assentos');
    const data: ApiResponse = await res.json();
    if (data.seats) {
      seats.value = data.seats.sort((a, b) => {
        const numA = Number.parseInt(a.seatNumber.replace(/\D/g, '')) || 0;
        const numB = Number.parseInt(b.seatNumber.replace(/\D/g, '')) || 0;
        return numA - numB;
      });
    }
  } catch (err: unknown) {
    emit('toast', {
      type: 'error',
      title: 'Erro de Conexão',
      message: err instanceof Error ? err.message : 'Não foi possível consultar a API.',
    });
  } finally {
    isInitializing.value = false;
  }
}

// Conexão reativa SSE
function setupSSE() {
  if (eventSource) {
    eventSource.close();
  }

  eventSource = new EventSource(`/api/v1/sessions/${props.sessionId}/stream`);

  eventSource.addEventListener('SEAT_HELD', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      const target = seats.value.find((s) => s.seatNumber === data.seatNumber);
      if (target) {
        target.status = 'HELD';
        target.cartId = data.cartId;
        target.expiresAt = data.expiresAt;
      }
    } catch (err) {
      console.error('Erro processando evento SEAT_HELD:', err);
    }
  });

  eventSource.addEventListener('SEAT_RESERVED', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      const target = seats.value.find((s) => s.seatNumber === data.seatNumber);
      if (target) {
        target.status = 'RESERVED';
        target.expiresAt = null;
      }
    } catch (err) {
      console.error('Erro processando evento SEAT_RESERVED:', err);
    }
  });

  eventSource.addEventListener('SEAT_RELEASED', (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      const target = seats.value.find((s) => s.seatNumber === data.seatNumber);
      if (target) {
        target.status = 'AVAILABLE';
        target.cartId = null;
        target.expiresAt = null;
      }
    } catch (err) {
      console.error('Erro processando evento SEAT_RELEASED:', err);
    }
  });

  eventSource.onerror = () => {
    console.warn('Conexão SSE oscilou. O navegador tentará reconectar...');
  };
}

// Ações do Usuário
async function holdSeat(seatNumber: string) {
  isProcessing.value = seatNumber;
  try {
    const res = await fetch(`/api/v1/sessions/${props.sessionId}/seats/${seatNumber}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartId: cartId.value }),
    });

    if (res.status === 409) {
      emit('toast', {
        type: 'warning',
        title: 'Cadeira Indisponível!',
        message: 'Outro usuário ou totem acabou de selecionar este assento.',
      });
      return;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Erro ao reter assento');
    }

    const data: ApiResponse = await res.json();
    if (data.seat) {
      const target = seats.value.find((s) => s.seatNumber === seatNumber);
      if (target) {
        target.status = 'HELD';
        target.cartId = data.seat.cartId;
        target.expiresAt = data.seat.expiresAt;
      }
    }

    emit('toast', {
      type: 'success',
      title: 'Assento Retido!',
      message: `Assento ${seatNumber} bloqueado para você por 10 minutos.`,
    });
  } catch (err: unknown) {
    emit('toast', {
      type: 'error',
      title: 'Falha no Bloqueio',
      message: err instanceof Error ? err.message : 'Erro ao reter assento',
    });
  } finally {
    isProcessing.value = null;
  }
}

async function confirmSeat(seatNumber: string) {
  isProcessing.value = seatNumber;
  try {
    const res = await fetch(`/api/v1/sessions/${props.sessionId}/seats/${seatNumber}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartId: cartId.value }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Erro ao confirmar reserva');
    }

    const target = seats.value.find((s) => s.seatNumber === seatNumber);
    if (target) {
      target.status = 'RESERVED';
      target.expiresAt = null;
    }

    emit('toast', {
      type: 'success',
      title: 'Compra Confirmada!',
      message: `Ingresso do assento ${seatNumber} garantido com sucesso!`,
    });
  } catch (err: unknown) {
    emit('toast', {
      type: 'error',
      title: 'Falha na Confirmação',
      message: err instanceof Error ? err.message : 'Erro ao confirmar reserva',
    });
  } finally {
    isProcessing.value = null;
  }
}

async function releaseSeat(seatNumber: string) {
  isProcessing.value = seatNumber;
  try {
    const res = await fetch(`/api/v1/sessions/${props.sessionId}/seats/${seatNumber}/hold`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cartId: cartId.value }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Erro ao liberar assento');
    }

    const target = seats.value.find((s) => s.seatNumber === seatNumber);
    if (target) {
      target.status = 'AVAILABLE';
      target.cartId = null;
      target.expiresAt = null;
    }

    emit('toast', {
      type: 'info',
      title: 'Assento Liberado',
      message: `Assento ${seatNumber} foi disponibilizado novamente.`,
    });
  } catch (err: unknown) {
    emit('toast', {
      type: 'error',
      title: 'Falha na Liberação',
      message: err instanceof Error ? err.message : 'Erro ao liberar assento',
    });
  } finally {
    isProcessing.value = null;
  }
}

// Helpers de Timer
function getRemainingSeconds(expiresAt?: string | null): number {
  if (!expiresAt) return 0;
  const diff = Math.max(0, new Date(expiresAt).getTime() - currentTime.value);
  return Math.floor(diff / 1000);
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Computeds
const myHeldSeats = computed(() => {
  return seats.value.filter((s) => s.status === 'HELD' && s.cartId === cartId.value);
});

const stats = computed(() => {
  const available = seats.value.filter((s) => s.status === 'AVAILABLE').length;
  const myHeld = myHeldSeats.value.length;
  const othersHeld = seats.value.filter(
    (s) => s.status === 'HELD' && s.cartId !== cartId.value,
  ).length;
  const reserved = seats.value.filter((s) => s.status === 'RESERVED').length;
  return { available, myHeld, othersHeld, reserved, total: seats.value.length };
});

onMounted(() => {
  initCartId();
  fetchSeats();
  setupSSE();

  timerInterval = setInterval(() => {
    currentTime.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval);
  if (eventSource) eventSource.close();
});
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-8">
    <!-- Top Header: Totem e Informações da Sessão -->
    <header class="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 shadow-xl">
      <div class="flex items-center gap-4">
        <div class="h-12 w-12 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-2xl">
          🎟️
        </div>
        <div>
          <h1 class="text-xl font-black tracking-tight text-white flex items-center gap-2">
            CineReserve
            <span class="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
              Totem Interativo
            </span>
          </h1>
          <p class="text-xs text-slate-400 mt-0.5">
            Sessão: <span class="font-mono text-slate-200 font-semibold">{{ sessionId }}</span>
          </p>
        </div>
      </div>

      <!-- Identificador do Totem / Carrinho -->
      <div class="flex items-center gap-3 bg-slate-950/70 px-3.5 py-2 rounded-xl border border-slate-800/80">
        <div class="text-right">
          <span class="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Meu Identificador</span>
          <span class="text-xs font-mono font-bold text-amber-400">{{ cartId }}</span>
        </div>
        <button
          @click="resetTotemCart"
          class="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-700 transition cursor-pointer font-medium"
          title="Simula outro totem trocando de cartId"
        >
          🔄 Trocar
        </button>
      </div>
    </header>

    <!-- Legenda de Cores e Estados -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
        <div class="w-4 h-4 rounded-md bg-emerald-500 shadow-sm shadow-emerald-500/50"></div>
        <div class="text-xs">
          <span class="font-bold text-slate-200">Disponível</span>
          <span class="block text-[10px] text-slate-400">({{ stats.available }})</span>
        </div>
      </div>

      <div class="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
        <div class="w-4 h-4 rounded-md bg-amber-400 shadow-sm shadow-amber-400/50"></div>
        <div class="text-xs">
          <span class="font-bold text-amber-400">Meu Assento</span>
          <span class="block text-[10px] text-slate-400">({{ stats.myHeld }})</span>
        </div>
      </div>

      <div class="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
        <div class="w-4 h-4 rounded-md bg-orange-600/70 border border-orange-500/40"></div>
        <div class="text-xs">
          <span class="font-bold text-orange-400">Outro Usuário</span>
          <span class="block text-[10px] text-slate-400">({{ stats.othersHeld }})</span>
        </div>
      </div>

      <div class="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
        <div class="w-4 h-4 rounded-md bg-rose-600/60 border border-rose-500/40"></div>
        <div class="text-xs">
          <span class="font-bold text-rose-400">Vendido</span>
          <span class="block text-[10px] text-slate-400">({{ stats.reserved }})</span>
        </div>
      </div>
    </div>

    <!-- Área da Sala de Cinema -->
    <div class="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
      <!-- Tela Curva do Cinema -->
      <div class="flex flex-col items-center mb-12">
        <div class="w-full max-w-xl h-3 rounded-t-full bg-gradient-to-r from-indigo-500 via-sky-300 to-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.6)]"></div>
        <span class="text-[11px] font-bold tracking-[0.3em] uppercase text-slate-400 mt-2">
          TELA DO CINEMA
        </span>
      </div>

      <!-- Loading State -->
      <div v-if="isInitializing" class="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
        <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm">Carregando mapa da sala...</span>
      </div>

      <!-- Grid com os 20 Assentos -->
      <div v-else class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-3.5 max-w-4xl mx-auto">
        <div
          v-for="seat in seats"
          :key="seat.seatNumber"
          class="relative group"
        >
          <!-- Assento AVAILABLE -->
          <button
            v-if="seat.status === 'AVAILABLE'"
            @click="holdSeat(seat.seatNumber)"
            :disabled="isProcessing === seat.seatNumber"
            class="w-full aspect-square rounded-2xl font-black text-sm flex flex-col items-center justify-center transition-all transform hover:-translate-y-1 active:translate-y-0 cursor-pointer bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 shadow-lg shadow-emerald-950/60 border border-emerald-400/40"
          >
            <span class="text-base leading-none">🪑</span>
            <span class="text-xs font-bold tracking-tight mt-1">{{ seat.seatNumber }}</span>
          </button>

          <!-- Assento HELD pelo MEU cartId -->
          <div
            v-else-if="seat.status === 'HELD' && seat.cartId === cartId"
            class="w-full aspect-square rounded-2xl p-1 flex flex-col items-center justify-between bg-gradient-to-b from-amber-400 to-amber-500 text-slate-950 border-2 border-white shadow-xl glow-yellow select-none"
          >
            <div class="text-[10px] font-extrabold uppercase tracking-tight text-slate-900 leading-tight">
              MEU
            </div>
            <span class="text-xs font-black">{{ seat.seatNumber }}</span>
            <div class="text-[10px] font-mono font-black bg-slate-950/80 text-amber-300 px-1.5 py-0.5 rounded-md">
              ⏱️ {{ formatTimer(getRemainingSeconds(seat.expiresAt)) }}
            </div>
          </div>

          <!-- Assento HELD por OUTRO cartId -->
          <div
            v-else-if="seat.status === 'HELD'"
            class="w-full aspect-square rounded-2xl flex flex-col items-center justify-center bg-orange-950/40 border border-orange-500/30 text-orange-400/80 cursor-not-allowed select-none"
            title="Assento selecionado por outro cliente"
          >
            <span class="text-xs">🔒</span>
            <span class="text-[11px] font-bold mt-0.5">{{ seat.seatNumber }}</span>
            <span class="text-[9px] uppercase tracking-tighter opacity-70">Ocupado</span>
          </div>

          <!-- Assento RESERVED (Vendido) -->
          <div
            v-else-if="seat.status === 'RESERVED'"
            class="w-full aspect-square rounded-2xl flex flex-col items-center justify-center bg-rose-950/30 border border-rose-900/40 text-rose-500/60 cursor-not-allowed select-none"
            title="Assento vendido"
          >
            <span class="text-xs">✕</span>
            <span class="text-[11px] font-bold mt-0.5">{{ seat.seatNumber }}</span>
            <span class="text-[9px] uppercase tracking-tighter opacity-60">Vendido</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Barra de Ações Flutuante / Resumo do Carrinho -->
    <transition
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-8 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100"
      leave-to-class="translate-y-8 opacity-0"
    >
      <div
        v-if="myHeldSeats.length > 0"
        class="sticky bottom-6 z-40 bg-slate-900/95 backdrop-blur-xl border-2 border-amber-500/60 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4"
      >
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl">
            🎟️
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-white">
                Assentos Selecionados:
              </span>
              <span class="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-mono font-bold text-xs border border-amber-500/30">
                {{ myHeldSeats.map((s) => s.seatNumber).join(', ') }}
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-1">
              Confirme sua compra antes que o tempo de reserva temporária expire.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3 w-full sm:w-auto">
          <!-- Botão Liberar Todos -->
          <button
            @click="myHeldSeats.forEach((s) => releaseSeat(s.seatNumber))"
            :disabled="isProcessing !== null"
            class="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition cursor-pointer"
          >
            Liberar Assento(s)
          </button>

          <!-- Botão Confirmar Compra -->
          <button
            @click="myHeldSeats.forEach((s) => confirmSeat(s.seatNumber))"
            :disabled="isProcessing !== null"
            class="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/60 transition transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          >
            Confirmar Compra
          </button>
        </div>
      </div>
    </transition>
  </div>
</template>
