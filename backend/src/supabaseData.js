const collectionConfig = {
  clients: {
    table: "clients",
    fields: {
      company: "company",
      industry: "industry",
      platform: "platform",
      status: "status"
    }
  },
  tasks: {
    table: "tasks",
    fields: {
      title: "title",
      priority: "priority",
      owner: "owner",
      status: "status"
    }
  },
  promptJobs: {
    table: "prompt_jobs",
    fields: {
      type: "type",
      client: "client",
      platform: "platform",
      llmProvider: "llm_provider",
      llmModel: "llm_model",
      temperature: "temperature",
      maxTokens: "max_tokens",
      reasoningMode: "reasoning_mode",
      skillSelection: "skill_selection",
      autonomy: "autonomy",
      sourceBrief: "source_brief",
      previousPrompt: "previous_prompt",
      clientFeedback: "client_feedback",
      optimizationTarget: "optimization_target",
      output: "output",
      qaChecklist: "qa_checklist",
      testReport: "test_report",
      latencyNotes: "latency_notes",
      deploymentPackage: "deployment_package"
    }
  }
};

function getConfig(collectionName) {
  const config = collectionConfig[collectionName];
  if (!config) {
    throw new Error(`Unsupported collection: ${collectionName}`);
  }

  return config;
}

function toDbPayload(config, payload) {
  return Object.entries(config.fields).reduce((record, [apiKey, dbKey]) => {
    if (Object.prototype.hasOwnProperty.call(payload, apiKey)) {
      record[dbKey] = payload[apiKey];
    }

    return record;
  }, {});
}

function fromDbRow(config, row) {
  const record = {
    id: row.id,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };

  for (const [apiKey, dbKey] of Object.entries(config.fields)) {
    record[apiKey] = row[dbKey];
  }

  return record;
}

function throwIfError(error) {
  if (!error) return;

  const wrapped = new Error(error.message || "Supabase request failed.");
  wrapped.status = Number(error.status) || 500;
  throw wrapped;
}

export async function listUserCollection(supabase, collectionName) {
  const config = getConfig(collectionName);
  const { data, error } = await supabase
    .from(config.table)
    .select("*")
    .order("updated_at", { ascending: false });

  throwIfError(error);
  return (data || []).map((row) => fromDbRow(config, row));
}

export async function createUserDoc(supabase, uid, collectionName, payload) {
  const config = getConfig(collectionName);
  const { data, error } = await supabase
    .from(config.table)
    .insert({
      user_id: uid,
      ...toDbPayload(config, payload)
    })
    .select("*")
    .single();

  throwIfError(error);
  return fromDbRow(config, data);
}

export async function updateUserDoc(supabase, uid, collectionName, id, payload) {
  const config = getConfig(collectionName);
  const { data, error } = await supabase
    .from(config.table)
    .update(toDbPayload(config, payload))
    .eq("id", id)
    .eq("user_id", uid)
    .select("*")
    .single();

  throwIfError(error);
  return fromDbRow(config, data);
}

export async function deleteUserDoc(supabase, uid, collectionName, id) {
  const config = getConfig(collectionName);
  const { error } = await supabase.from(config.table).delete().eq("id", id).eq("user_id", uid);

  throwIfError(error);
}
