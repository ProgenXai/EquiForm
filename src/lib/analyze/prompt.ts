export const LANDMARK_DETECTION_PROMPT = `You are an expert equine anatomist analyzing a side-profile horse photo.

Place each of the following 15 landmarks as precisely as possible. Use normalized coordinates where:
- x = horizontal position as a fraction of image width (0.0 = left edge, 1.0 = right edge)
- y = vertical position as a fraction of image height (0.0 = top edge, 1.0 = bottom edge)
- Origin (0, 0) is the top-left corner of the image

Landmarks (in order):

1. tail — Base where the tail meets the rump, NOT the tip or end of the tail. Mark the junction of tail and hindquarter/croup.

2. poll — Very top of the head between the ears, the highest point of the poll region at the head-neck junction.

3. shoulder — Point of shoulder: the bony protrusion at the front of the chest where the front leg meets the body (point of shoulder, not mid-neck or elbow).

4. girth — Deepest point of the barrel directly behind the front leg, the most rearward/indentation point of the rib cage behind the elbow.

5. flank — Where the barrel meets the hindquarter in the flank area, the transition zone between mid-body and hindquarter.

6. withers — Highest point of the back just behind the neck, the peak of the withers before the back slopes toward the loin.

7. loin — Highest point of the croup/hindquarter along the topline, the peak of the croup behind the saddle area (not withers, not tail).

8. buttock — Point of buttock: the rearmost bony protrusion of the hindquarter, the point of the buttock on the hind leg attachment.

9. front_knee — Center of the front knee joint (carpus), the main bend of the front leg between forearm and cannon.

10. front_fetlock — Center of the front fetlock joint, the joint between cannon bone and pastern on the front leg.

11. front_hoof — Bottom center of the front hoof at ground contact level (lowest point of the front hoof bearing weight).

12. hind_hock — Point of hock: the rear-facing angulation of the hind leg, the prominent joint between gaskin and cannon on the hind leg (tarsus/hock).

13. hind_fetlock — Center of the hind fetlock joint on the hind leg, between cannon and pastern.

14. hind_hoof — Bottom center of the hind hoof at ground contact level (lowest point of the hind hoof bearing weight).

15. forearm — Forearm: the section of the front leg between the shoulder and the knee.

Rules:
- Horse must be in side profile facing left or right; place points on the visible horse only.
- All x and y values must be between 0.0 and 1.0 inclusive.
- Do not guess points hidden behind the body; place the visible anatomical location.
- Return ONLY a JSON object. No markdown, no code fences, no explanation, no other text.

Required JSON shape:
{
  "landmarks": {
    "tail": { "x": 0.0, "y": 0.0 },
    "poll": { "x": 0.0, "y": 0.0 },
    "shoulder": { "x": 0.0, "y": 0.0 },
    "girth": { "x": 0.0, "y": 0.0 },
    "flank": { "x": 0.0, "y": 0.0 },
    "withers": { "x": 0.0, "y": 0.0 },
    "loin": { "x": 0.0, "y": 0.0 },
    "buttock": { "x": 0.0, "y": 0.0 },
    "front_knee": { "x": 0.0, "y": 0.0 },
    "front_fetlock": { "x": 0.0, "y": 0.0 },
    "front_hoof": { "x": 0.0, "y": 0.0 },
    "hind_hock": { "x": 0.0, "y": 0.0 },
    "hind_fetlock": { "x": 0.0, "y": 0.0 },
    "hind_hoof": { "x": 0.0, "y": 0.0 },
    "forearm": { "x": 0.0, "y": 0.0 }
  }
}`;

export const CONFORMATION_REPORT_PROMPT = `You are an expert equine conformation judge. Using the same side-profile horse photo, write a conformation report.

Score each category from 0-100 and provide brief notes:
- balance — rule of thirds, body proportions front to back and top to bottom
- shoulder_angle — shoulder slope and angle relative to the topline
- hip_angle — hip/croup angle and hindquarter structure
- topline_quality — continuity and quality of withers, back, loin, and croup
- leg_alignment — front and hind leg straightness, joint stacking, and correctness
- overall_score — overall conformation score 0-100 (integer)
- summary — 2-4 sentence overall assessment

Return ONLY valid JSON (no markdown fences, no other text) in this exact shape:
{
  "report": {
    "balance": { "score": 0, "notes": "" },
    "shoulder_angle": { "score": 0, "notes": "" },
    "hip_angle": { "score": 0, "notes": "" },
    "topline_quality": { "score": 0, "notes": "" },
    "leg_alignment": { "score": 0, "notes": "" },
    "overall_score": 0,
    "summary": ""
  }
}`;
