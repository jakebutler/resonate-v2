# Session account: geocoder comparison

This account is synthetic, written as a test fixture.

We set out to answer one question in an afternoon: can a cheaper geocoder replace the one we pay for?

The agent wrote a small harness that sends each of 240 surveyed delivery addresses to three vendors and measures how far each answer lands from the surveyed point. The first run looked too good for the cheapest vendor. The cause was a caching proxy left on from an earlier job, which replayed another vendor's answers for 19 addresses. We turned it off and reran all three vendors.

The clean run took 11 minutes. The agent then grouped the misses by address type, which is where the apartment pattern showed up.

What we would do differently: check for a proxy before the first run, and add addresses from new developments on purpose, since those were the second-largest group of misses.
