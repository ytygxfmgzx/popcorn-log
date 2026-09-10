<script setup lang="ts">
import { computed } from 'vue';
import PosterImage from '@/components/PosterImage.vue';
import { useMovieMeta } from '@/composables/useMovieMeta';
import { relativeDayLabel, formatDateShort } from '@/utils/date';
import { LOCATION_EMOJI, type WatchRecord } from '@/types';
import type { ViewingRank } from '@/stats/viewings';

const props = defineProps<{
  record: WatchRecord;
  /** 同片观看名次（首页统一计算传入；看过 ≥2 次才显示徽章） */
  viewingRank?: ViewingRank;
}>();

const { meta: movieMeta } = useMovieMeta(
  computed(() => props.record.mediaType),
  computed(() => props.record.tmdbId),
);

const timeLabel = computed(() => {
  const label = relativeDayLabel(props.record.watchedDate);
  return label || formatDateShort(props.record.watchedDate);
});

const summary = computed(() => props.record.quote || props.record.note || '');

const stars = computed(() => '★★★★★'.slice(0, props.record.rating ?? 0));

const locationLabel = computed(() => {
  const emoji = LOCATION_EMOJI[props.record.location];
  return emoji ? `${emoji} ${props.record.location}` : props.record.location;
});
</script>

<template>
  <div class="record-card">
    <PosterImage class="poster" :poster-path="movieMeta?.posterPath" :alt="record.titleSnapshot" />
    <div class="info">
      <div class="title">
        {{ record.titleSnapshot }}
        <em v-if="movieMeta?.releaseYear">({{ movieMeta.releaseYear }})</em>
        <span
          v-if="viewingRank && viewingRank.total >= 2"
          class="rewatch-badge"
        >第 {{ viewingRank.rank }} 次</span>
      </div>
      <div class="meta-line">
        {{ formatDateShort(record.watchedDate) }} · {{ locationLabel }}
      </div>
      <div v-if="record.members.length" class="member-line">
        <span v-for="member in record.members" :key="member" class="member-mini">{{ member }}</span>
      </div>
      <div v-if="summary" class="note-line">{{ summary }}</div>
      <div class="row-bottom">
        <span v-if="record.rating" class="stars">{{ stars }}</span>
        <span v-else class="stars off">未评分</span>
        <span class="time">{{ timeLabel }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.record-card {
  display: flex;
  gap: 12px;
  background: var(--c-card);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-card);
  padding: 12px;
  margin-bottom: 12px;
  cursor: pointer;
}

.poster {
  width: 76px;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.title {
  font-size: var(--t-17);
  font-weight: 600;
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title em {
  font-style: normal;
  font-size: var(--t-12);
  color: var(--c-text-3);
  font-weight: 400;
  flex: none;
}

.rewatch-badge {
  flex: none;
  font-size: var(--t-11);
  font-weight: 500;
  color: var(--c-primary-active);
  background: var(--c-primary-weak);
  border-radius: 999px;
  padding: 1px 7px;
  transform: translateY(-1px);
}

.meta-line {
  font-size: var(--t-14);
  color: var(--c-text-2);
  margin-top: 3px;
}

.member-line {
  display: flex;
  gap: 6px;
  margin-top: 7px;
  flex-wrap: wrap;
}

.member-mini {
  font-size: var(--t-12);
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--c-primary-weak);
  color: var(--c-primary-active);
}

.note-line {
  font-size: var(--t-14);
  color: var(--c-text-2);
  margin-top: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 6px;
}

.stars {
  font-size: 13px;
  letter-spacing: 2px;
  color: var(--c-star);
}

.stars.off {
  font-size: var(--t-12);
  color: var(--c-text-3);
  letter-spacing: normal;
}

.time {
  font-size: var(--t-12);
  color: var(--c-text-3);
}
</style>
