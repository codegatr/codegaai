"""
codegaai.core.code_indexer
==========================

Local codebase indexing and compact context-pack generation.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path

from codegaai.core.ast_graph import build_python_graph
from codegaai.core.code_chunks import CodeChunk, chunk_code
from codegaai.core.codebase_ignore import CodegaIgnore


TEXT_EXTS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".php", ".md", ".txt",
    ".json", ".yaml", ".yml", ".html", ".css", ".sql", ".sh",
}


@dataclass
class CodeIndex:
    root: str
    chunks: list[CodeChunk] = field(default_factory=list)
    graphs: dict[str, dict] = field(default_factory=dict)
    files: list[str] = field(default_factory=list)

    @property
    def file_count(self) -> int:
        return len(self.files)

    def search(self, query: str, max_chunks: int = 5) -> list[CodeChunk]:
        terms = [term.lower() for term in query.split() if len(term) > 2]
        scored: list[tuple[int, CodeChunk]] = []
        for chunk in self.chunks:
            haystack = f"{chunk.path} {chunk.symbol} {chunk.text}".lower()
            score = sum(haystack.count(term) for term in terms)
            if score:
                scored.append((score, chunk))
        scored.sort(key=lambda item: (-item[0], item[1].path, item[1].start_line))
        return [chunk for _, chunk in scored[:max_chunks]]

    def context_pack(self, query: str, max_chunks: int = 6) -> dict:
        chunks = self.search(query, max_chunks=max_chunks)
        if not chunks:
            chunks = self.chunks[:max_chunks]
        text_parts = []
        files = []
        for chunk in chunks:
            files.append(chunk.path)
            text_parts.append(
                f"### {chunk.path}:{chunk.start_line}-{chunk.end_line} {chunk.symbol}\n"
                f"```{chunk.language}\n{chunk.text}\n```"
            )
        return {
            "query": query,
            "files": sorted(set(files)),
            "chunks": [asdict(chunk) for chunk in chunks],
            "text": "\n\n".join(text_parts),
        }


class CodeIndexer:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.ignore = CodegaIgnore.from_root(self.root)

    def build(self) -> CodeIndex:
        index = CodeIndex(root=str(self.root))
        for path in sorted(self.root.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(self.root).as_posix()
            if self.ignore.is_ignored(rel) or path.suffix.lower() not in TEXT_EXTS:
                continue
            try:
                content = path.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            index.files.append(rel)
            index.chunks.extend(chunk_code(rel, content))
            if path.suffix.lower() == ".py":
                index.graphs[rel] = asdict(build_python_graph(rel, content))
        return index
