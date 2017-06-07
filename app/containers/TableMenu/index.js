import { connect } from 'react-redux';
import { createStructuredSelector } from 'reselect';
import { browserHistory } from 'react-router';
import { setAuthState } from '../AccountProvider/actions';
import { makeSelectLoggedIn } from '../AccountProvider/selectors';
import {
  makeSelectOpen,
  makeSelectActive,
} from './selectors';
import {
  toggleMenuOpen,
  toggleMenuActive,
} from './actions';

import TableMenu from '../../components/TableMenu';

const mapDispatchToProps = (dispatch) => ({
  handleClickLogout: () => {
    browserHistory.push('/login');
    return dispatch(setAuthState({ loggedIn: false }));
  },
  toggleMenuOpen: () => dispatch(toggleMenuOpen()),
  toggleMenuActive: () => dispatch(toggleMenuActive()),
});

const mapStateToProps = createStructuredSelector({
  loggedIn: makeSelectLoggedIn(),
  open: makeSelectOpen(),
  active: makeSelectActive(),
});

export default connect(mapStateToProps, mapDispatchToProps)(TableMenu);