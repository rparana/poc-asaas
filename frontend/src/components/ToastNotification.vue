<script setup lang="ts">
export interface Toast {
  id: string;
  type: 'error' | 'success' | 'warning' | 'info';
  title: string;
  message: string;
}

defineProps<{
  toasts: Toast[];
}>();

const emit = defineEmits<(e: 'dismiss', id: string) => void>();
</script>

<template>
  <div class="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
    <transition-group
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto p-4 rounded-xl shadow-2xl border backdrop-blur-md flex items-start gap-3 transition-all"
        :class="{
          'bg-rose-950/90 border-rose-600 text-rose-100 shadow-rose-900/40': toast.type === 'error',
          'bg-emerald-950/90 border-emerald-600 text-emerald-100 shadow-emerald-900/40': toast.type === 'success',
          'bg-amber-950/90 border-amber-600 text-amber-100 shadow-amber-900/40': toast.type === 'warning',
          'bg-slate-900/90 border-slate-700 text-slate-100': toast.type === 'info',
        }"
      >
        <div class="text-2xl select-none leading-none pt-0.5">
          <span v-if="toast.type === 'error'">🚨</span>
          <span v-else-if="toast.type === 'success'">🎉</span>
          <span v-else-if="toast.type === 'warning'">⚠️</span>
          <span v-else>ℹ️</span>
        </div>

        <div class="flex-1">
          <h4 class="font-bold text-sm tracking-wide">{{ toast.title }}</h4>
          <p class="text-xs opacity-90 mt-0.5 leading-relaxed">{{ toast.message }}</p>
        </div>

        <button
          @click="emit('dismiss', toast.id)"
          class="text-xs opacity-60 hover:opacity-100 p-1 hover:bg-white/10 rounded cursor-pointer transition"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>
    </transition-group>
  </div>
</template>
