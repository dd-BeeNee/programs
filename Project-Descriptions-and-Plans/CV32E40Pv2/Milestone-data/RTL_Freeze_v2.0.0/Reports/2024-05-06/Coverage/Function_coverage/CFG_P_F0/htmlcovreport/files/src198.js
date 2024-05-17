var g_data = {"name":"/shark0/processing/cv32e40p/users/processing/PRODUCTS_DIGITAL_DESIGN/PANTHER/PANTHER_1.0/CV32/NR/CFG_P_F0/NR_QUESTA_INT_DEBUG_LONG/workdir/cv32e40p/env/uvme/uvme_rv32isa_covg_trn.sv","src":"// Copyright 2020 OpenHW Group\n// Copyright 2020 Silicon Labs, Inc.\n// \n// Licensed under the Solderpad Hardware Licence, Version 2.0 (the \"License\");\n// you may not use this file except in compliance with the License.\n// You may obtain a copy of the License at\n// \n//     https://solderpad.org/licenses/\n// \n// Unless required by applicable law or agreed to in writing, software\n// distributed under the License is distributed on an \"AS IS\" BASIS,\n// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\n// See the License for the specific language governing permissions and\n// limitations under the License.\n//\n// SPDX-License-Identifier: Apache-2.0 WITH SHL-2.0\n\n\n`ifndef __UVME_RV32ISA_COVG_TRN_SV__\n`define __UVME_RV32ISA_COVG_TRN_SV__\n\n\n/**\n * Class encapsulation of instruction struct for passing instruction coverage\n   through UVM testbench\n */\nclass uvme_rv32isa_covg_trn_c extends uvml_trn_mon_trn_c;\n   \n    ins_t ins;\n\n    // Note, structs are not supported in the uvm field macros\n    `uvm_object_utils_begin(uvme_rv32isa_covg_trn_c)   \n    `uvm_object_utils_end\n    \n    /**\n    * Default constructor.\n    */\n    extern function new(string name=\"uvme_rv32isa_covg_trn\");\n   \n    extern function void do_copy(uvm_object rhs);\n    extern function void do_print(uvm_printer printer);\n\nendclass : uvme_rv32isa_covg_trn_c\n\n\n`pragma protect begin\n\nfunction uvme_rv32isa_covg_trn_c::new(string name=\"uvme_rv32isa_covg_trn\");\n   \n   super.new(name);\n   \nendfunction : new\n\nfunction void uvme_rv32isa_covg_trn_c::do_copy(uvm_object rhs);\n    uvme_rv32isa_covg_trn_c rhs_trn;\n\n    super.do_copy(rhs);\n    assert($cast(rhs_trn, rhs));\n\n    this.ins.ins_str = rhs_trn.ins.ins_str;    \n    this.ins.asm     = rhs_trn.ins.asm;\n    foreach (this.ins.ops[i]) begin\n        this.ins.ops[i].key = rhs_trn.ins.ops[i].key;\n        this.ins.ops[i].val = rhs_trn.ins.ops[i].val;\n    end\nendfunction : do_copy\n\nfunction void uvme_rv32isa_covg_trn_c::do_print(uvm_printer printer);\n    super.do_print(printer);\n\n    printer.print_string(\"ins\", ins.ins_str);\n    printer.print_string(\"asm\", ins.asm.name());\n    foreach (this.ins.ops[i]) begin\n        printer.print_string($sformatf(\"op[%0d]\", i), $sformatf(\"%s %s\", this.ins.ops[i].key, this.ins.ops[i].val));\n    end\nendfunction : do_print\n\n`pragma protect end\n\n\n`endif // __UVME_RV32ISA_COVG_TRN_SV__\n","lang":"verilog"};
processSrcData(g_data);