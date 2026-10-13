# Nudity Level v1.2.1

Move these 18 defaults to Neutral with no standalone nudity signal:

- All Chastity variants: Chastity, Chastity (Male), Chastity (Female), Metal Chastity, Plastic Chastity, Cum in Chastity.
- Footjob, Pussy Rubbing, Gloryhole, Stand Cradle, Catheter.
- Weights, Clover Clamps, Clothes Pin, Alligator Clamp.
- Vibrating, Nipple Clamps, Sucking Toy/Dildo.

These tags alone remain Unknown when body analysis is absent, and do not raise a completed body analysis above None. Other positive tags and explicitly configured compound rules continue to contribute normally.

Upgrade applies the changes once to matching factory assignments, preserving moved/custom tags, removed assignments, bound IDs, and compound rules. Restore defaults uses the revised buckets.

Validation: classification and upgrade regression checks, existing frontend/browser checks, and ZIP loading through Cove's isolated extension loader. Requires Cove 1.5.1 or newer.
