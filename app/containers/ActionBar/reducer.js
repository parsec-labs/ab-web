/**
 * Created by jzobro on 20170608
 */
import { fromJS } from 'immutable';
import * as types from './actions';

export const initialState = fromJS({
  visible: false,
});

export default function actionBarReducer(state = initialState, action) {
  switch (action.type) {

    case types.ACTIONBAR_TOGGLE_VISIBLE: {
      return state.set('visible', !state.get('visible'));
    }

    default: {
      return state;
    }
  }
}