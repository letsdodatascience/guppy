// @flow
/**
 * NOTE: I built this reducer trying to think of it as a database model.
 * Each task has a unique ID, and is a child of a project.
 *
 * In practice, it's felt like a lot of trouble to keep this "flat" table
 * of entities.
 *
 * When it came time to do the same thing for dependencies, I decided to go
 * with a "nested" structure, where the top-level keys of the `dependencies`
 * reducer are all project IDs, and it holds a simple map of the dependencies
 * for that project
 *
 * It felt much simpler and easier to work with, so I should probably update
 * this reducer to match that reducer's style. Right now they're inconsistent
 * and that's bad.
 */

import produce from 'immer';
import { createSelector } from 'reselect';

import {
  REFRESH_PROJECTS_FINISH,
  ADD_PROJECT,
  LAUNCH_DEV_SERVER,
  RUN_TASK,
  COMPLETE_TASK,
  ATTACH_TASK_METADATA,
  RECEIVE_DATA_FROM_TASK_EXECUTION,
  IMPORT_EXISTING_PROJECT_FINISH,
  SAVE_PROJECT_SETTINGS_FINISH,
  CLEAR_CONSOLE,
  RESET_ALL_STATE,
} from '../actions';

import type { Action } from 'redux';
import type { Task, ProjectType } from '../types';

type TaskMap = {
  [taskName: string]: Task,
};

type State = {
  [projectId: string]: TaskMap,
};

export const initialState = {};

export default (state: State = initialState, action: Action = {}) => {
  switch (action.type) {
    case REFRESH_PROJECTS_FINISH: {
      return produce(state, draftState => {
        Object.keys(action.projects).forEach(projectId => {
          const project = action.projects[projectId];

          Object.keys(project.scripts).forEach(name => {
            const command = project.scripts[name];

            if (!draftState[projectId]) {
              draftState[projectId] = {};
            }

            // If this task already exists, we need to be careful.
            //
            // This action is called when we want to read from the disk, and
            // it's possible that the user has manually edited the package.json.
            // We want to update the task command.
            //
            // But! We also store a bunch of metadata in this reducer, like
            // the log history, and the `timeSinceStatusChange`. So we don't
            // want to overwrite it, we want to merge it.
            if (draftState[projectId][name]) {
              draftState[projectId][name].command = command;
              return;
            }

            draftState[projectId][name] = buildNewTask(
              projectId,
              name,
              command
            );
          });
        });
      });
    }

    case ADD_PROJECT:
    case IMPORT_EXISTING_PROJECT_FINISH: {
      const { project } = action;

      const projectId = project.guppy.id;

      return produce(state, draftState => {
        Object.keys(project.scripts).forEach(name => {
          const command = project.scripts[name];

          if (!draftState[projectId]) {
            draftState[projectId] = {};
          }

          draftState[projectId][name] = buildNewTask(projectId, name, command);
        });
      });
    }

    case SAVE_PROJECT_SETTINGS_FINISH: {
      const { project } = action;

      const projectId = project.guppy.id;

      return produce(state, draftState => {
        Object.keys(project.scripts).forEach(name => {
          const command = project.scripts[name];

          draftState[projectId][name] = buildNewTask(projectId, name, command);
        });
      });
    }

    case LAUNCH_DEV_SERVER:
    case RUN_TASK: {
      const { task, timestamp } = action;

      return produce(state, draftState => {
        // If this is a long-running task, it's considered successful as long
        // as it doesn't have an failed.
        // For periodic tasks, though, this is a 'pending' state.
        const nextStatus = task.type === 'short-term' ? 'pending' : 'success';

        draftState[task.projectId][task.name].status = nextStatus;
        draftState[task.projectId][task.name].timeSinceStatusChange = timestamp;
      });
    }

    case CLEAR_CONSOLE: {
      const { task } = action;

      return produce(state, draftState => {
        draftState[task.projectId][task.name].logs = [];
      });
    }

    case COMPLETE_TASK: {
      const { task, timestamp, wasSuccessful } = action;

      return produce(state, draftState => {
        // For the eject task, we simply want to delete this task altogether.
        // TODO: We should probably do this in `REFRESH_PROJECTS_FINISH`, which
        // is called right after the eject task succeeds!
        if (task.name === 'eject') {
          delete draftState[task.projectId][task.name];
          return;
        }

        // For short-term tasks like building for production, we want to show
        // either a success or failed status.
        // For long-running tasks, though, once a task is completed, it goes
        // back to being "idle" regardless of whether it was successful or not.
        // Long-running tasks reserve "failed" for cases where the task is
        // still running, it's just hit an error.
        //
        // TODO: Come up with a better model for all of this :/
        let nextStatus;
        if (task.type === 'short-term') {
          nextStatus = wasSuccessful ? 'success' : 'failed';
        } else {
          nextStatus = 'idle';
        }

        draftState[task.projectId][task.name].status = nextStatus;
        draftState[task.projectId][task.name].timeSinceStatusChange = timestamp;
        delete draftState[task.projectId][task.name].processId;
      });
    }

    case ATTACH_TASK_METADATA: {
      const { task, processId, port } = action;

      return produce(state, draftState => {
        draftState[task.projectId][task.name].processId = processId;

        if (port) {
          draftState[task.projectId][task.name].port = port;
        }
      });
    }

    case RECEIVE_DATA_FROM_TASK_EXECUTION: {
      const { task, text, isError, logId } = action;

      if (task.name === 'eject' && !state[task.id]) {
        // When ejecting a CRA project, the `eject` task is removed from the
        // project, since it's a 1-time operation.
        // TODO: We should avoid sending this action, we don't need to capture
        // output for a deleted task
        return state;
      }

      return produce(state, draftState => {
        draftState[task.projectId][task.name].logs.push({ id: logId, text });

        // Either set or reset a failed status, based on the data received.
        const nextStatus = isError
          ? 'failed'
          : task.type === 'short-term'
            ? 'pending'
            : 'success';

        draftState[task.projectId][task.name].status = nextStatus;
      });
    }

    case RESET_ALL_STATE:
      return initialState;

    default:
      return state;
  }
};

//
//
//
// Helpers
export const getTaskDescription = (name: string) => {
  // NOTE: This information is currently derivable, and it's bad to store
  // derivable data in the reducer... but, I expect soon this info will be
  // editable on a project-by-project basis, and so we will need to store this
  // in the reducer.
  switch (name) {
    case 'start': {
      return 'Run a local development server';
    }
    case 'build': {
      return 'Bundle your project for production';
    }
    case 'test': {
      return 'Run the automated tests';
    }
    case 'eject': {
      return 'Permanently reveal the create-react-app configuration files';
    }
    case 'format': {
      return 'Runs a formatter that tweaks your code to align with industry best-practices';
    }
    default: {
      return '';
    }
  }
};

export const isDevServerTask = (name: string) =>
  // Gatsby and create-react-app use different names for the same task.
  name === 'start' || name === 'develop';

const getTaskType = name => {
  // We have two kinds of tasks:
  // - long-running tasks, like the dev server
  // - short-term tasks, like building for production.
  //
  // The distinction is important because the expectations are different.
  // For a dev server, "running" is a successful status - it means there are
  // no errors - while for a short-term task, "running" is essentially the same
  // as "loading", it's a yellow-light kind of thing.
  const sustainedTasks = ['start', 'develop'];

  return sustainedTasks.includes(name) ? 'sustained' : 'short-term';
};

// TODO: A lot of this stuff shouldn't be done here :/ maybe best to resolve
// this in an action before it hits the reducer?
const buildNewTask = (
  projectId: string,
  name: string,
  command: string
): Task => ({
  name,
  projectId,
  command,
  description: getTaskDescription(name),
  type: getTaskType(name),
  status: 'idle',
  timeSinceStatusChange: null,
  logs: [],
});

//
//
//
// Selectors
type GlobalState = { tasks: State };

export const getTasks = (state: any) => state.tasks;

export const getTaskByProjectIdAndTaskName = (
  state: GlobalState,
  props: {
    projectId: string,
    taskName: string,
  }
) =>
  state.tasks[props.projectId]
    ? state.tasks[props.projectId][props.taskName]
    : undefined;

export const getTasksForProjectId = (
  state: any,
  props: { projectId: string }
): TaskMap => {
  return state.tasks[props.projectId];
};

export const getTasksInTaskListForProjectId = createSelector(
  [getTasksForProjectId],
  tasks =>
    Object.keys(tasks)
      .map(taskId => tasks[taskId])
      .filter(task => !isDevServerTask(task.name))
);

export const getDevServerTaskForProjectId = (
  state: GlobalState,
  props: {
    projectId: string,
    projectType: ProjectType,
  }
) => {
  switch (props.projectType) {
    case 'create-react-app': {
      return state.tasks[props.projectId].start;
    }

    case 'gatsby': {
      return state.tasks[props.projectId].develop;
    }

    default:
      throw new Error('Unrecognized project type: ' + props.projectType);
  }
};
