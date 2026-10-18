"""Material contract teaching example. Python 3, no engine dependency."""
from copy import deepcopy
from math import isfinite


def validate(material):
    """Expects normalized metadata; this is not an engine asset-file parser."""
    errors = []
    if material.get("schema_version") != 1:
        errors.append("schema_version: explicit migration required")
    textures = material.get("textures", {})
    mask = textures.get("surface_mask", {})
    if mask.get("color_space") != "linear":
        errors.append("surface_mask: linear data required")
    if mask.get("channels") != ["coverage", "roughness", "reserved"]:
        errors.append("surface_mask: incompatible channel layout")
    strength = material.get("highlight_strength")
    if (type(strength) not in (int, float)
            or not isfinite(strength) or not 0 <= strength <= 1):
        errors.append("highlight_strength: finite value in [0, 1] required")
    features = set(material.get("features", []))
    if features - {"directional_highlight"}:
        errors.append("features: unsupported feature")
    if "directional_highlight" in features:
        if textures.get("fiber_direction", {}).get("space") != "tangent":
            errors.append("fiber_direction: tangent-space input required")
    quality = material.get("quality")
    if quality not in {"full", "base"}:
        errors.append("quality: unknown profile")
    elif quality == "base" and features:
        errors.append("quality: base profile does not support these features")
    return errors


BASE = {
    "schema_version": 1,
    "quality": "full",
    "features": ["directional_highlight"],
    "highlight_strength": 0.5,
    "textures": {
        "surface_mask": {
            "color_space": "linear",
            "channels": ["coverage", "roughness", "reserved"]
        },
        "fiber_direction": {"space": "tangent"}
    }
}

if __name__ == "__main__":
    cases = [("valid", deepcopy(BASE), [])]
    mutations = [
        ("wrong_color_space", lambda m: m["textures"]["surface_mask"].update(color_space="sRGB"), "surface_mask"),
        ("wrong_channels", lambda m: m["textures"]["surface_mask"].update(channels=["roughness", "coverage", "reserved"]), "channel"),
        ("missing_direction", lambda m: m["textures"].pop("fiber_direction"), "fiber_direction"),
        ("not_a_number", lambda m: m.update(highlight_strength=float("nan")), "highlight_strength"),
        ("incompatible_quality", lambda m: m.update(quality="base"), "quality"),
        ("old_schema", lambda m: m.update(schema_version=0), "schema_version"),
    ]
    for name, mutate, expected in mutations:
        m = deepcopy(BASE)
        mutate(m)
        cases.append((name, m, [expected]))
    for name, m, expected in cases:
        errors = validate(m)
        assert len(errors) == len(expected), (name, errors)
        assert all(part in error for part, error in zip(expected, errors))
        print(name + ": " + ("ACCEPT" if not errors else "REJECT / " + errors[0]))
    print("7/7 fixture expectations passed")
