// Side-effect imports: each module registers its named sync fixture.
// Fixture names are the stable references verification manifests cite.
import "./articleDependencies.fixture";
import "./blogExport.fixture";
import "./bufferFoundations.fixture";
import "./destinationRefreshHold.fixture";
import "./editorialVisuals.fixture";
import "./preparedImport.fixture";
import "./queuePlanning.fixture";
import "./queueRelease.fixture";
import "./seriesPosts.fixture";
import "./seriesReview.fixture";
import "./seriesUrlFilters.fixture";

export {
  listSyncFixtureNames,
  mockSyncFixture,
  registerSyncFixture,
} from "./registry";
export type { SyncFixture, SyncFixtureFactory } from "./registry";
export type { ArticleDependenciesFixture } from "./articleDependencies.fixture";
export type { BlogExportFixture } from "./blogExport.fixture";
export type { BufferFoundationsFixture } from "./bufferFoundations.fixture";
export type { DestinationRefreshHoldFixture } from "./destinationRefreshHold.fixture";
export type { EditorialVisualsFixture } from "./editorialVisuals.fixture";
export type { PreparedImportFixture } from "./preparedImport.fixture";
export type { QueuePlanningFixture } from "./queuePlanning.fixture";
export type { QueueReleaseFixture } from "./queueRelease.fixture";
export type { SeriesPostsFixture } from "./seriesPosts.fixture";
export type { SeriesReviewFixture } from "./seriesReview.fixture";
export type { SeriesUrlFiltersFixture } from "./seriesUrlFilters.fixture";
