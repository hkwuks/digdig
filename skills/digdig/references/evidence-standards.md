# Evidence Standards

> Source quality tiers, cross-validation rules, conflict resolution, and citation format for deep search sessions.
>
> This is a reference companion to the [SOP](SOP.md). Read the SOP first for the operational procedure.

## 1. Source Quality

### White List (trust by default)

- Official documentation (docs.*, README, official sites)
- Package managers (PyPI, npm, crates.io)
- Standards documents (PEP, RFC, W3C)
- Academic sources (arxiv.org, ACM, IEEE)

### Grey Zone (use cautiously)

- Tech blogs (check author authority)
- Stack Overflow (check votes and accepted answers)
- GitHub Issues (take trend signals, not as conclusions)

### Black List (avoid)

- SEO farms (keyword stuffing, machine-generated)
- AI-translated aggregator sites
- Content without publication dates

> When presenting search results, follow the Result Quality Filtering principle: keep liberally, filter conservatively; when uncertain, keep rather than delete (see Section 1 above).

---

## 2. Cross-Validation

**Hard Requirement**:
- Each factual conclusion needs >= 2 independent sources
- "Independent" = different domain + different author + not cross-posted

**Single authoritative source does not need Low annotation**:
```
FastAPI 0.136.0 was released on 2026-04-16.
Sources:
- [fastapi - PyPI](https://pypi.org/project/fastapi/)
```
**Single non-authoritative source needs annotation**:
```
A company plans to open-source its internal framework (Confidence: Low, single non-official source)
- Only one tech media report, company has not confirmed.

Sources:
- [Tech media report](https://example.com/article)
```

---

## 3. Conflict Resolution

When sources disagree:

1. **Don't hide disagreements**: present evidence from both sides
2. **Assess authority**: official > mainstream media > self-media
3. **Assess timeliness**: recent > older
4. **Give judgment**: explain reasoning or honestly mark as uncertain

---

## 4. Citation Format

- Each source uses markdown link: `[Title](URL)`
- Forbidden: fabricating URLs, title without link, using evidence-free phrases like "multiple sources indicate"

---

> **Back to**: [SOP](SOP.md): core operational procedure
