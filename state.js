export const state = {
  user:             null,
  house:            null,
  areas:            [],
  issues:           [],
  projects:         [],
  currentView:      'dashboard',
  currentProjectId: null,
  authMode:         'signin',
  issueFilters:     { status: [], area: [], type: [] },
  unsubscribers:    []
};
