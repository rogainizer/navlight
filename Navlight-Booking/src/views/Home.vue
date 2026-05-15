
<template>
  <div class="menu" role="tablist" aria-label="Main navigation">
    <div class="menu-group">
      <button :class="['tab-btn', { active: view === 'calendar' }]" @click="view = 'calendar'">Calendar</button>
      <button :class="['tab-btn', { active: view === 'booking' }]" @click="view = 'booking'">Book Navlight</button>
    </div>
    <button :class="['tab-btn', 'admin-tab', { active: view === 'admin' }]" @click="view = 'admin'">Admin</button>
  </div>
  <div class="panel" v-if="view === 'calendar'">
    <BookingCalendar :bookings="bookings" />
  </div>
  <div class="panel" v-else-if="view === 'booking'">
    <BookingForm @booking-success="refreshBookings" />
  </div>
  <div class="panel" v-else-if="view === 'admin'">
    <AdminPanel @bookings-updated="syncBookings" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import BookingForm from '../components/BookingForm.vue'
import BookingCalendar from '../components/BookingCalendar.vue'
import AdminPanel from '../components/AdminPanel.vue'
import { fetchBookings } from '../api/bookings.js'

const view = ref('calendar')
const bookings = ref([])

async function syncBookings() {
  bookings.value = await fetchBookings()
}

async function refreshBookings() {
  await syncBookings()
  view.value = 'calendar'
}

onMounted(refreshBookings)
</script>
<style scoped>
.menu {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid #e8edf5;
  padding-bottom: 12px;
}

.menu-group {
  display: flex;
  gap: 8px;
}

.admin-tab {
  margin-left: auto;
}

.tab-btn {
  border: 1px solid #d8deea;
  background: #f8faff;
  color: #334155;
  border-radius: 10px;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  background: #eef3ff;
}

.tab-btn.active {
  background: #1d4ed8;
  border-color: #1d4ed8;
  color: #ffffff;
}

.panel {
  padding-top: 6px;
}

@media (max-width: 640px) {
  .menu {
    flex-wrap: wrap;
    gap: 8px;
  }

  .menu-group {
    width: 100%;
    flex-wrap: wrap;
  }

  .admin-tab {
    margin-left: 0;
  }
}
</style>
