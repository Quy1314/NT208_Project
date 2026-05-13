"""Continuity validation for scene graphs vs canonical DB."""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from scene_graph.schemas import SceneGraph
from services import canon_queries as cq


@dataclass
class ValidationReport:
    ok: bool
    violations: list[str] = field(default_factory=list)

    def add(self, msg: str) -> None:
        self.ok = False
        self.violations.append(msg)


def validate_scene_against_db(db: Session, scene: SceneGraph) -> ValidationReport:
    rep = ValidationReport(ok=True)
    if not scene.characters:
        rep.add("scene has no characters")

    for ch in scene.characters:
        db_ch = cq.get_character_by_slug(db, scene.scope_id, ch.slug)
        if not db_ch or db_ch.id != ch.character_id:
            rep.add(f"character mismatch for slug {ch.slug}")

    # Party integrity for primary character (single-owner MVP).
    if scene.characters:
        ch0 = scene.characters[0]
        party_db = cq.get_party_rows(db, ch0.character_id)
        db_creature_ids = {p.creature_instance_id for p in party_db}
        scene_ids = {c.instance_id for c in scene.creatures}
        if db_creature_ids != scene_ids:
            rep.add(
                f"party mismatch for {ch0.slug}: scene has {[str(x) for x in sorted(scene_ids)]}, "
                f"canon has {[str(x) for x in sorted(db_creature_ids)]}"
            )

    return rep
