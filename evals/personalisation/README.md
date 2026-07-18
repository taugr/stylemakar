# Personalisation evals

This suite verifies the deterministic contract behind Voice Coach and Fine-tune
My Voice. Every curated comparison has two deliberately different target
profiles, the expected preference instruction is explicit, and the two profile
families must choose opposite candidates for the same source.

Run:

```sh
pnpm eval:personalisation
```

This is a regression and profile-differentiation gate, not evidence that users
prefer the tuned voice. Product efficacy still requires blinded local proof
records and independent reviewers. Private calibration sessions are not copied
into this directory automatically.

The planned human threshold remains unclaimed until review data exists:

- tuned voice versus prior voice
- ties and neither responses reported separately
- meaning-change reports counted as failures
- completion and editing effort reported alongside preference
