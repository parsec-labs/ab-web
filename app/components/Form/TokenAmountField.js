import React from 'react';
import PropTypes from 'prop-types';
import { FormattedMessage } from 'react-intl';

import messages from '../../containers/Dashboard/messages';
import { ETH, NTZ } from '../../containers/Dashboard/actions';

import { InputWithUnit } from '../Input';
import Label from '../Label';
import Dropdown from '../Dropdown';
import { ErrorMessage, WarningMessage } from '../FormMessages';
import Token from '../Dropdown/Token';
import Ethereum from '../Logo/Ethereum';
import Nutz from '../Logo/Nutz';

import FormGroup from './FormGroup';
import {
  ControlWrapper,
  FieldGroup,
  Unit,
} from './styles';

const tokens = [{
  id: ETH,
  node: Token,
  props: {
    name: <FormattedMessage {...messages.ethereum} />,
    icon: <Ethereum height={26} width={26} />,
  },
}, {
  id: NTZ,
  node: Token,
  props: {
    name: <FormattedMessage {...messages.nutz} />,
    icon: <Nutz height={26} width={26} />,
  },
}];

class TokenAmountField extends React.Component {
  constructor(props) {
    super(props);
    this.state = { amountFocus: false };
    this.handleAmountFocus = this.handleAmountFocus.bind(this);
    this.handleAmountBlur = this.handleAmountBlur.bind(this);
    this.handleUnitFocus = this.handleUnitFocus.bind(this);
  }

  handleAmountFocus() {
    this.setState({ amountFocus: true });
  }

  handleAmountBlur() {
    this.setState({ amountFocus: false });
  }

  handleUnitFocus() {
    this.props.reset();
  }

  render() {
    const {
      input,
      label,
      type,
      amountUnit,
      setAmountUnit,
      meta: { touched, error, warning },
    } = this.props;
    return (
      <FormGroup>
        <Label htmlFor={input.name}>{label}</Label>
        <ControlWrapper>
          <FieldGroup focus={this.state.amountFocus}>
            <InputWithUnit
              {...input}
              {...this.props}
              onFocus={this.handleAmountFocus}
              type={type}
              id={input.name}
            />
            <Unit name="unit">{amountUnit}</Unit>
          </FieldGroup>
          <FieldGroup style={{ width: 180 }} focus={this.state.unitFocus}>
            <Dropdown
              selected={amountUnit}
              onSelect={setAmountUnit}
              options={tokens}
              handleFocus={this.handleUnitFocus}
              {...this.props}
            />
          </FieldGroup>
        </ControlWrapper>

        {touched && error && <ErrorMessage error={error} />}
        {touched && warning && <WarningMessage error={warning} />}
      </FormGroup>
    );
  }
}
TokenAmountField.propTypes = {
  input: PropTypes.object,
  label: PropTypes.node,
  type: PropTypes.string,
  meta: PropTypes.object,
  amountUnit: PropTypes.string,
  setAmountUnit: PropTypes.func,
  reset: PropTypes.func.isRequired,
};

export default TokenAmountField;
