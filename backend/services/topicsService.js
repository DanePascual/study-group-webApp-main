// backend/services/topicsService.js
// Simple service wrapper for topics using the Supabase server client.

const supabase = require("../config/supabase");

async function createTopic({
  title,
  description = "",
  category = "discussion",
  tags = [],
  author_id,
  author_name,
}) {
  const insert = {
    title,
    description,
    category,
    tags: Array.isArray(tags) ? tags : [],
    author_id,
    author_name,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    post_count: 0,
    view_count: 0,
    pinned: false,
  };
  const { data, error } = await supabase
    .from("topics")
    .insert([insert])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listTopics({
  search = "",
  sort = "newest",
  category = "all",
  limit = 500,
} = {}) {
  let q = supabase.from("topics").select("*");
  if (sort === "newest") q = q.order("created_at", { ascending: false });
  else if (sort === "oldest") q = q.order("created_at", { ascending: true });
  else if (sort === "activity") q = q.order("post_count", { ascending: false });

  if (category && category !== "all") q = q.eq("category", category);
  if (search) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  q = q.limit(Math.min(1000, parseInt(limit, 10) || 500));

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function incrementView(topicId) {
  // read current view_count then update (simple approach)
  const { data: topic, error: fetchErr } = await supabase
    .from("topics")
    .select("view_count")
    .eq("id", topicId)
    .single();
  if (fetchErr) throw fetchErr;
  const current = topic && topic.view_count ? topic.view_count : 0;
  const { data, error } = await supabase
    .from("topics")
    .update({ view_count: current + 1 })
    .eq("id", topicId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  createTopic,
  listTopics,
  incrementView,
};
