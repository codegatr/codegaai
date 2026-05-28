"""
codegaai.core.frontier_capabilities
===================================

Frontier AI capability planner.

This module turns a user instruction into an executable capability contract:
which reasoning strategy to use, which model family to prefer, which tools or
modalities are needed, and how self-learning/federation must stay privacy-first.

It does not pretend that a local desktop app has magically become a frontier
base model. It gives Codega AI the orchestration layer needed to route work
toward coding, reasoning, multimodal, federated-learning, and video pipelines.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


VIDEO_PATTERNS = (
    r"\b(video\w*|film|klip|animasyon|sahne|storyboard|sinema)\b",
    r"\b(text[- ]?to[- ]?video|image[- ]?to[- ]?video|i2v|t2v)\b",
)
IMAGE_PATTERNS = (
    r"\b(resim|görsel|fotoğraf|logo|afiş|illustrasyon|illüstrasyon)\b",
    r"\b(image|photo|picture|poster|generate art)\b",
)
CODE_PATTERNS = (
    r"\b(kod|program|uygulama|debug|hata|api|endpoint|veritabanı|sql)\b",
    r"\b(code|program|function|class|bug|error|database|typescript|python|php)\b",
)
RESEARCH_PATTERNS = (
    r"\b(araştır|internetten|makale|kaynak|güncel|son)\b",
    r"\b(research|paper|source|latest|web)\b",
)
REASONING_PATTERNS = (
    r"\b(mantık|akıl yürüt|analiz|neden|karşılaştır|planla|strateji)\b",
    r"\b(reason|analyze|compare|prove|solve|strategy)\b",
)
AUDIO_PATTERNS = (
    r"\b(ses\w*|konuşma|dublaj|müzik|efekt|transkript)\b",
    r"\b(audio|speech|voice|music|sound|transcribe)\b",
)


@dataclass(frozen=True)
class CapabilityPlan:
    task: str
    model_family: str
    reasoning_strategy: str
    modalities: list[str] = field(default_factory=list)
    tools: list[str] = field(default_factory=list)
    federated_learning: dict[str, Any] = field(default_factory=dict)
    video_pipeline: dict[str, Any] = field(default_factory=dict)
    safety_contract: list[str] = field(default_factory=list)
    execution_notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "task": self.task,
            "model_family": self.model_family,
            "reasoning_strategy": self.reasoning_strategy,
            "modalities": self.modalities,
            "tools": self.tools,
            "federated_learning": self.federated_learning,
            "video_pipeline": self.video_pipeline,
            "safety_contract": self.safety_contract,
            "execution_notes": self.execution_notes,
        }


def _matches(text: str, patterns: tuple[str, ...]) -> bool:
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)


def detect_frontier_task(prompt: str) -> str:
    text = prompt.lower()
    if _matches(text, VIDEO_PATTERNS):
        return "video"
    if _matches(text, IMAGE_PATTERNS):
        return "image"
    if _matches(text, CODE_PATTERNS):
        return "code"
    if _matches(text, RESEARCH_PATTERNS):
        return "research"
    if _matches(text, AUDIO_PATTERNS):
        return "audio"
    if _matches(text, REASONING_PATTERNS) or len(text.split()) >= 28:
        return "reasoning"
    return "chat"


def _reasoning_strategy(task: str, prompt: str) -> str:
    text = prompt.lower()
    if task in {"code", "research"}:
        return "react_tool_loop"
    if task == "video":
        return "storyboard_plan_consistency_check"
    if "kanıtla" in text or "prove" in text or "çöz" in text or "solve" in text:
        return "tree_of_thoughts_with_self_check"
    if task == "reasoning":
        return "deliberate_multi_step_self_check"
    return "fast_direct_answer"


def _model_family(task: str) -> str:
    return {
        "code": "qwen_coder_or_strong_code_llm",
        "research": "long_context_reasoning_llm_with_web_tools",
        "video": "diffusion_transformer_or_cogvideox_video_stack",
        "image": "flux_or_sdxl_image_diffusion",
        "audio": "whisper_asr_plus_xtts_or_piper_tts",
        "reasoning": "qwen3_or_llama_reasoning_llm",
        "chat": "fast_multilingual_chat_llm",
    }[task]


def _modalities(task: str, prompt: str) -> list[str]:
    mods = ["text"]
    if task == "video":
        mods.extend(["video", "image", "audio"])
    elif task == "image":
        mods.append("image")
    elif task == "audio":
        mods.append("audio")
    if "ekran" in prompt.lower() or "screen" in prompt.lower():
        mods.append("screen")
    return list(dict.fromkeys(mods))


def _tools(task: str) -> list[str]:
    tools = {
        "code": ["codebase_search", "run_python", "terminal", "file_tools"],
        "research": ["web_search", "source_summarizer", "citation_checker"],
        "video": ["video_generator", "image_generator", "audio_generator", "safety_checker"],
        "image": ["image_generator", "vision_checker"],
        "audio": ["speech_to_text", "text_to_speech"],
        "reasoning": ["calculator", "self_check"],
        "chat": [],
    }
    return tools[task]


def federated_learning_policy() -> dict[str, Any]:
    return {
        "mode": "opt_in_privacy_first",
        "can_learn_from": [
            "explicit user feedback",
            "anonymous quality counters",
            "sanitized public topic signals",
            "locally approved adapters",
        ],
        "never_sends": [
            "raw chat text",
            "private files",
            "API keys or tokens",
            "local paths",
            "personally identifying content",
        ],
        "server_contract": [
            "aggregate signals across peers",
            "return public high-confidence knowledge",
            "reject low-quality or secret-like topics",
        ],
    }


def video_pipeline_policy(prompt: str) -> dict[str, Any]:
    wants_audio = _matches(prompt.lower(), AUDIO_PATTERNS)
    return {
        "preferred_stack": [
            "storyboard decomposition",
            "scene/keyframe planning",
            "text-to-video or image-to-video generation",
            "temporal consistency pass",
            "native or generated audio pass",
            "provenance and safety metadata",
        ],
        "local_models": ["cogvideox-5b", "cogvideox-2b", "svd-xt"],
        "frontier_targets": [
            "diffusion transformer style scaling",
            "character and scene consistency",
            "camera control",
            "synchronized audio",
        ],
        "requires_audio": wants_audio,
    }


def plan_capabilities(prompt: str) -> CapabilityPlan:
    task = detect_frontier_task(prompt)
    safety = [
        "Do not expose hidden chain-of-thought; provide concise reasoning summaries.",
        "Use tools when the question depends on current facts, files, execution, or media generation.",
        "Federated learning is opt-in and never uploads private raw content.",
    ]
    notes = [
        "Route by user intent, not by a manual model picker.",
        "Prefer the strongest downloaded model that fits device memory.",
    ]
    if task == "video":
        notes.append("Use storyboard and consistency checks before generation.")

    return CapabilityPlan(
        task=task,
        model_family=_model_family(task),
        reasoning_strategy=_reasoning_strategy(task, prompt),
        modalities=_modalities(task, prompt),
        tools=_tools(task),
        federated_learning=federated_learning_policy(),
        video_pipeline=video_pipeline_policy(prompt) if task == "video" else {},
        safety_contract=safety,
        execution_notes=notes,
    )


def build_capability_prompt(plan: CapabilityPlan) -> str:
    tools = ", ".join(plan.tools) if plan.tools else "none"
    modalities = ", ".join(plan.modalities)
    return (
        "## Capability Plan\n"
        f"- task: {plan.task}\n"
        f"- model_family: {plan.model_family}\n"
        f"- reasoning_strategy: {plan.reasoning_strategy}\n"
        f"- modalities: {modalities}\n"
        f"- tools: {tools}\n"
        "- answer_policy: Think carefully, use available tools when needed, "
        "but show the user only the useful final reasoning summary.\n"
    )
