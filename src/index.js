import { prebuiltAppConfig, CreateMLCEngine } from "@mlc-ai/web-llm";
import hljs from "highlight.js";
import ace from "ace-builds";

// Required for ace to resolve the module correctly
require("ace-builds/src-noconflict/mode-javascript");
require("ace-builds/webpack-resolver");

let engine = null;
let useCustomGrammar = false;

document.addEventListener("DOMContentLoaded", () => {
  const modelSelection = document.getElementById("model-selection");
  const promptTextarea = document.getElementById("prompt");
  const outputDiv = document.getElementById("output");
  const statsParagraph = document.getElementById("stats");

  // Populate model selection dropdown
  const availableModels = prebuiltAppConfig.model_list
    .filter(
      (m) =>
        m.model_id.startsWith("SmolLM2")
    )
    .map((m) => m.model_id);

  let selectedModel = availableModels[0];

  availableModels.forEach((modelId) => {
    const option = document.createElement("option");
    option.value = modelId;
    option.textContent = modelId;
    modelSelection.appendChild(option);
  });

  modelSelection.value = selectedModel;

  modelSelection.onchange = (e) => {
    selectedModel = e.target.value;
    engine = null; // Reset the engine when the model changes
  };

  // Setup JSON Schema Editor
  const jsonSchemaEditor = ace.edit("schema", {
    mode: "ace/mode/javascript",
    theme: "ace/theme/github",
    wrap: true,
  });

  // Set default schema
  jsonSchemaEditor.setValue(`{
    "title": "GitHubIssue",
    "type": "object",
    "properties": {
      "title": {
        "type": "string",
        "description": "The title of the issue"
      },
      "description": {
        "type": "string",
        "description": "Detailed description of the issue"
      },
      "labels": {
        "type": "array",
        "items": {
          "type": "string",
          "enum": ["bug", "enhancement", "documentation", "high-priority", "security"]
        },
        "description": "Labels to categorize the issue"
      },
      "priority": {
        "type": "string",
        "enum": ["low", "medium", "high", "critical"],
        "description": "Priority level of the issue"
      },
      "assignees": {
        "type": "array",
        "items": {
          "type": "string"
        },
        "maxItems": 3,
        "description": "GitHub usernames of assigned users (max 3)"
      },
      "estimated_time": {
        "type": "string",
        "pattern": "^[0-9]+[hdwm]$",
        "description": "Estimated time to resolve (e.g., '2h', '3d', '1w', '1m')"
      }
    },
    "required": [
      "title",
      "description",
      "priority",
      "labels"
    ]
  }`);

  // Set default prompt
  promptTextarea.value = `Create a detailed issue for the following problem:

The login page is not properly handling password reset requests. Users report that they are not receiving the password reset emails, and when they do receive them, the reset links are sometimes expired. This is affecting about 20% of our users and needs immediate attention.

Please include appropriate labels, priority level, and time estimation.`;

  // Generate button click handler
  document.getElementById("generate").onclick = async () => {
    try {
      outputDiv.innerHTML = '<div class="loading">Initializing model...</div>';
      
      if (!engine) {
        engine = await CreateMLCEngine(selectedModel, {
          initProgressCallback: (progress) => {
            console.log(progress);
            outputDiv.innerHTML = `<div class="loading">${progress.text}</div>`;
          },
        });
      }

      const schemaInput = jsonSchemaEditor.getValue();
      const schema = JSON.stringify(JSON.parse(schemaInput)); // Validate JSON
      const response_format = { type: "json_object", schema };

      const request = {
        stream: true,
        stream_options: { include_usage: true },
        messages: [{ role: "user", content: promptTextarea.value }],
        max_tokens: 512,
        response_format,
      };

      let curMessage = "";
      let usage = null;
      outputDiv.innerHTML = '<div class="loading">Generating response...</div>';
      
      const generator = await engine.chatCompletion(request);

      for await (const chunk of generator) {
        const curDelta = chunk.choices[0]?.delta.content;
        if (curDelta) curMessage += curDelta;
        if (chunk.usage) {
          console.log(chunk.usage);
          usage = chunk.usage;
        }
        outputDiv.innerHTML = `<pre><code class="language-json">${curMessage}</code></pre>`;
      }

      const finalMessage = await engine.getMessage();
      outputDiv.innerHTML = hljs.highlight(finalMessage, {
        language: "json",
      }).value;

      try {
        const issueData = JSON.parse(finalMessage);
        updateIssuePreview(issueData);
      } catch (error) {
        console.error('Failed to parse issue data:', error);
      }

      if (usage) {
        const statsTextParts = [];
        if (usage.extra.prefill_tokens_per_s) {
          statsTextParts.push(`Prefill Speed: ${usage.extra.prefill_tokens_per_s.toFixed(1)} tok/s`);
        }
        if (usage.extra.decode_tokens_per_s) {
          statsTextParts.push(`Decode Speed: ${usage.extra.decode_tokens_per_s.toFixed(1)} tok/s`);
        }
        statsParagraph.textContent = statsTextParts.join(" | ");
        statsParagraph.classList.remove("hidden");
      }
    } catch (error) {
      console.error("Generation error:", error);
      outputDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
  };
});

function updateIssuePreview(issueData) {
  const preview = document.getElementById('issue-preview');
  
  // Update title
  document.getElementById('preview-title').textContent = issueData.title;
  
  // Update priority badge
  const priorityBadge = document.getElementById('preview-priority');
  priorityBadge.textContent = issueData.priority.toUpperCase();
  priorityBadge.className = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium priority-${issueData.priority}`;
  
  // Update estimated time
  document.getElementById('preview-time-text').textContent = issueData.estimated_time;
  
  // Update labels
  const labelsContainer = document.getElementById('preview-labels');
  labelsContainer.innerHTML = '';
  issueData.labels.forEach(label => {
    const labelEl = document.createElement('span');
    labelEl.className = `issue-label label-${label}`;
    labelEl.textContent = label;
    labelsContainer.appendChild(labelEl);
  });
  
  // Update description
  document.getElementById('preview-description').textContent = issueData.description;
  
  // Update assignees
  const assigneesContainer = document.getElementById('preview-assignees');
  assigneesContainer.innerHTML = '';
  if (issueData.assignees && issueData.assignees.length > 0) {
    issueData.assignees.forEach(assignee => {
      const avatarEl = document.createElement('div');
      avatarEl.className = 'assignee-avatar';
      avatarEl.textContent = assignee.charAt(0).toUpperCase();
      assigneesContainer.appendChild(avatarEl);
    });
  } else {
    assigneesContainer.innerHTML = '<span class="text-sm text-gray-500">No assignees</span>';
  }
  
  // Show the preview with animation
  preview.classList.remove('hidden');
  // Force a reflow
  preview.offsetHeight;
  preview.classList.add('visible');
}
