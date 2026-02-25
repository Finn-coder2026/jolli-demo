But the test expects a push because the merged content differs from what's on the server. The bug is that the fingerprint is set to the merged content's fingerprint, but the server still has the old content. The test expects the merge to be pushed.

Looking more closely at the test comment: "If fixed: serverVersion is 3 (B pushed the merged content)". The expectation is that after merge, client B should push the merged content to server.

The issue is that when we set meta.existing.fingerprint to the fingerprint of the resolved content AND meta.existing.serverVersion to the server's version, on the next push, the local fingerprint matches the entry fingerprint, so it thinks nothing changed.

The bug existed before my refactoring too - let me check if these tests were passing before. Let me revert to check: