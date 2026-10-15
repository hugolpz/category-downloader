<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <section id="not-found" class="card mx-auto max-w-xl p-8 text-center">
    <p class="eyebrow mb-2">Error 404</p>
    <h1 class="mb-3 text-3xl font-bold">This page does not exist</h1>
    <p class="muted mb-6">The address may be mistyped, or the link may be out of date.</p>
    <RouterLink id="not-found-home-link" :to="{ name: 'home' }" class="font-semibold">Back to the start</RouterLink>
  </section>
</template>
