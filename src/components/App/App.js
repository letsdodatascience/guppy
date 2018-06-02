// @flow
import React, { Component, Fragment } from 'react';
import { connect } from 'react-redux';
import { Switch, Route, withRouter } from 'react-router-dom';
import styled from 'styled-components';

import { refreshProjects, selectProject } from '../../actions';
import readLocalProjectsFromDisk from '../../services/read-local-projects.service';
import {
  extractProjectIdFromUrl,
  buildUrlForProjectId,
} from '../../services/location.service';
import {
  getProjectsArray,
  getSelectedProject,
} from '../../reducers/projects.reducer';
import { getOnboardingStatus } from '../../reducers/onboarding-status.reducer';

import Home from '../Home';
import IntroScreen from '../IntroScreen';
import Sidebar from '../Sidebar';
import Titlebar from '../Titlebar';
import ProjectPage from '../ProjectPage';
import CreateNewProjectWizard from '../CreateNewProjectWizard';

import type { Action } from 'redux';
import type { Project } from '../../types';
import type { State as OnboardingStatus } from '../../reducers/onboarding-status.reducer';

type Props = {
  initializing: boolean,
  onboardingStatus: OnboardingStatus,
  selectedProject: ?Project,
  projects: Array<Project>,
  refreshProjects: Action,
  selectProject: Action,
  history: any, // Provided by `withRouter`
};

class App extends Component<Props> {
  componentDidMount() {
    const {
      history,
      selectedProject,
      selectProject,
      refreshProjects,
    } = this.props;

    refreshProjects();

    // TODO: Redirect if project exists
    if (selectedProject) {
      history.replace(buildUrlForProjectId(selectedProject.id));
    }

    history.listen(location => {
      const projectId = extractProjectIdFromUrl(location);

      if (projectId) {
        selectProject(projectId);
      }
    });
  }

  componentWillReceiveProps(nextProps) {
    // It is expected that the user will only have 1 project at this point.
    // If, somehow, they have two... it would be bad to accidentally send
    // them to the wrong one. In this case, we'll let them click it from
    // the projects sidebar.
    const only1Project = nextProps.projects.length === 1;

    if (
      only1Project &&
      this.props.onboardingStatus !== 'done' &&
      nextProps.onboardingStatus === 'done'
    ) {
      this.forwardToProject(nextProps.projects[0]);
    }
  }

  forwardToProject = project => {
    this.props.history.push(buildUrlForProjectId(project.id));
  };

  render() {
    const { initializing } = this.props;

    // const DefaultComponent = hasProjects ? Home : IntroScreen;
    const DefaultComponent = IntroScreen; // TEMP

    return (
      <Fragment>
        <Titlebar />

        <Wrapper>
          <Sidebar />

          <MainContent>
            <Switch>
              <Route exact path="/" component={DefaultComponent} />
              <Route path="/project/:projectId" component={ProjectPage} />
            </Switch>
          </MainContent>
        </Wrapper>

        <CreateNewProjectWizard />
      </Fragment>
    );
  }
}

const Wrapper = styled.div`
  display: flex;
`;

const MainContent = styled.div`
  flex: 1;
`;

const mapStateToProps = state => ({
  initializing: state.initializing,
  onboardingStatus: getOnboardingStatus(state),
  projects: getProjectsArray(state),
  selectedProject: getSelectedProject(state),
});

export default withRouter(
  connect(
    mapStateToProps,
    { refreshProjects, selectProject }
  )(App)
);
